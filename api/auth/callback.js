import { db } from '../lib/supabase.js'
import crypto from 'crypto'

const FEISHU_APP_ID = process.env.FEISHU_APP_ID
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET
const REDIRECT_URI = process.env.FEISHU_REDIRECT_URI

function parseCookies(header) {
  const cookies = {}
  if (!header) return cookies
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=')
    cookies[k] = v.join('=')
  })
  return cookies
}

function validateState(cookieState, queryState) {
  if (!cookieState || !queryState) return false
  return cookieState === queryState
}

export default async function handler(req, res) {
  const { code, state: queryState } = req.query
  const cookies = parseCookies(req.headers.cookie)
  const savedState = cookies['feishu_state']

  // 1. Validate state (CSRF protection)
  if (!validateState(savedState, queryState)) {
    res.writeHead(302, { Location: '/?auth_error=invalid_state' })
    return res.end()
  }

  // 2. Exchange code for user_access_token
  let tokenData
  try {
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET,
      }),
    })
    tokenData = await tokenRes.json()
    if (tokenData.code !== 0) throw new Error(tokenData.msg || 'Token exchange failed')
  } catch (err) {
    res.writeHead(302, { Location: '/?auth_error=token_exchange_failed' })
    return res.end()
  }

  const { access_token, refresh_token, token_type } = tokenData.data

  // 3. Get user info
  let userInfo
  try {
    const userRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: { 'Authorization': 'Bearer ' + access_token },
    })
    const userData = await userRes.json()
    if (userData.code !== 0) throw new Error(userData.msg || 'User info fetch failed')
    userInfo = userData.data
  } catch (err) {
    res.writeHead(302, { Location: '/?auth_error=user_info_failed' })
    return res.end()
  }

  const { open_id, name, avatar_url, email } = userInfo

  // 4. Check if user is admin — or auto-register first admin
  let isAdmin = false
  let isFirstAdmin = false
  try {
    // Check if any admin exists
    const { count: adminCount } = await db
      .from('admins')
      .select('*', { count: 'exact', head: true })

    if (adminCount === 0) {
      // First ever login — auto-register as admin
      await db.from('admins').insert({
        feishu_open_id: open_id,
        name: name || '管理员',
        avatar_url: avatar_url || '',
      })
      isAdmin = true
      isFirstAdmin = true
    } else {
      const { data: adminData } = await db
        .from('admins')
        .select('feishu_open_id')
        .eq('feishu_open_id', open_id)
        .single()
      isAdmin = !!adminData
    }
  } catch {
    isAdmin = false
  }

  if (!isAdmin) {
    res.writeHead(302, { Location: '/?auth_error=not_admin' })
    return res.end()
  }

  // 5. Create session
  const sessionId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  try {
    await db
      .from('sessions')
      .insert({
        id: sessionId,
        feishu_open_id: open_id,
        name,
        avatar_url: avatar_url || '',
        expires_at: expiresAt,
      })
  } catch (err) {
    res.writeHead(302, { Location: '/?auth_error=session_create_failed' })
    return res.end()
  }

  // 6. Redirect to frontend with session
  const redirectUrl = '/?session=' + sessionId +
    '&name=' + encodeURIComponent(name) +
    '&avatar=' + encodeURIComponent(avatar_url || '')

  res.writeHead(302, {
    Location: redirectUrl,
    'Set-Cookie': 'feishu_state=; Path=/; Max-Age=0',
  })
  res.end()
}
