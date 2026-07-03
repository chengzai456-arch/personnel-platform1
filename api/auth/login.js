import crypto from 'crypto'

const FEISHU_APP_ID = process.env.FEISHU_APP_ID
const REDIRECT_URI = process.env.FEISHU_REDIRECT_URI

export default function handler(req, res) {
  const state = crypto.randomUUID()
  const authUrl = 'https://open.feishu.cn/open-apis/authen/v1/authorize' +
    '?app_id=' + FEISHU_APP_ID +
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
    '&state=' + state

  // Set state cookie for CSRF validation on callback
  res.setHeader('Set-Cookie', 'feishu_state=' + state + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=300')
  res.writeHead(302, { Location: authUrl })
  res.end()
}
