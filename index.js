import TelegramBot from 'node-telegram-bot-api'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true
})

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const PORT = process.env.PORT || 3000

const ADMIN_IDS = [7660364996, 8050370935]

const STARS_PRICES = {
  new: { 15: 117, 30: 294, 365: 2358 },
  renew: { 15: 176, 30: 352, 365: 2948 }
}

const CRYPTO_PRICES = {
  new: {
    15: 2.30,
    30: 5.90,
    365: 47.30
  },
  renew: {
    15: 3.50,
    30: 7.00,
    365: 59.00
  }
}

let rateLimitDelay = 0
let isProcessing = false

function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let key = ''
  for (let i = 0; i < 15; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return key
}

async function registerUser(msg) {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const username = msg.from.username ? `@${msg.from.username}` : 'null'
  const firstName = msg.from.first_name || ''
  const lastName = msg.from.last_name || ''
  const fullName = `${firstName} ${lastName}`.trim() || null

  try {
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id, avatar_url')
      .eq('idtg', userId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking user:', checkError)
      return false
    }

    let avatarUrl = null
    try {
      const photos = await bot.getUserProfilePhotos(userId, { limit: 1 })
      if (photos && photos.total_count > 0 && photos.photos && photos.photos.length > 0) {
        const sizes = photos.photos[0]
        const bestSize = sizes[sizes.length - 1]
        const fileId = bestSize.file_id
        try {
          avatarUrl = await bot.getFileLink(fileId)
        } catch (err) {
          console.warn('Could not get file link for avatar:', err.message || err)
        }
      }
    } catch (err) {
      console.warn('Could not fetch user profile photos:', err.message || err)
    }

    if (existingUser) {
      console.log(`User ${userId} already exists`)
      try {
        if (avatarUrl && existingUser.avatar_url !== avatarUrl) {
          const { error: updateErr } = await supabase
            .from('users')
            .update({ avatar_url: avatarUrl, registration_date: existingUser.registration_date || new Date().toISOString().split('T')[0] })
            .eq('idtg', userId)

          if (updateErr) console.error('Error updating avatar_url for existing user:', updateErr)
          else console.log(`Updated avatar_url for user ${userId}`)
        }
      } catch (err) {
        console.error('Error updating existing user avatar:', err)
      }

      return true
    }

    const key = generateKey()

    const { error: insertError } = await supabase
      .from('users')
      .insert({
        name: fullName,
        idtg: userId,
        telegram: username,
        key: key,
        status: 'pending',
        buykov: 0,
        role: 'user',
        registration_date: new Date().toISOString().split('T')[0],
        avatar_url: avatarUrl
      })

    if (insertError) {
      console.error('Error creating user:', insertError)
      return false
    }

    return true

  } catch (error) {
    console.error('Error in registerUser:', error)
    return false
  }
}

function showMainMenu(chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть приложение',
            web_app: { url: 'https://rogers1234556.github.io/Modele-/' }
          }
        ],
        [
          {
            text: 'Наш канал',
            url: 'https://t.me/mr_helpers'
          }
        ],
        [
          {
            text: 'Написать в поддержку',
            callback_data: 'support_request'
          }
        ]
      ]
    }
  }

  const message = `*Вас приветствует команда MR*\n\n` +
    `Выберите действие:`

  bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    ...options 
  })
}

function showSupportMenu(chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Оплата товара',
            callback_data: 'support_payment'
          }
        ],
        [
          {
            text: 'Проблемы с Helper\'ом',
            callback_data: 'support_helper'
          }
        ],
        [
          {
            text: 'Предложения по улучшению',
            callback_data: 'support_suggestions'
          }
        ],
        [
          {
            text: 'Другое',
            callback_data: 'support_other'
          }
        ]
      ]
    }
  }

  const message = `*Выберите тему обращения*\n\n` +
    `Пожалуйста, выберите наиболее подходящую категорию для вашего обращения:`

  bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    ...options 
  })
}

app.post('/api/create-stars-invoice', async (req, res) => {
  try {
    const { plan, isRenewal, userId } = req.body

    if (!plan || !userId) {
      return res.status(400).json({ success: false, message: 'Invalid data' })
    }

    const type = isRenewal ? 'renew' : 'new'
    const price = STARS_PRICES[type]?.[plan]

    if (!price) {
      return res.status(400).json({ success: false, message: 'Invalid plan' })
    }

    const title = `Подписка на ${plan} дней`
    const description = isRenewal ? 'Продление доступа Government' : 'Покупка доступа Government'

    const payload = JSON.stringify({
      userId: userId,
      plan: plan,
      type: type,
      isRenewal: isRenewal
    })

    const invoiceLink = await bot.createInvoiceLink(
      title,
      description,
      payload,
      "",
      "XTR",
      [{ label: title, amount: price }]
    )

    res.json({ success: true, invoiceUrl: invoiceLink })

  } catch (error) {
    console.error('Error creating invoice:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

app.post('/api/create-crypto-invoice', async (req, res) => {
  try {
    const { plan, isRenewal, userId } = req.body

    if (!plan || !userId) {
      return res.status(400).json({ ok: false, message: 'Invalid data' })
    }

    const type = isRenewal ? 'renew' : 'new'
    const price = CRYPTO_PRICES[type]?.[plan]

    if (!price) {
      return res.status(400).json({ ok: false, message: 'Invalid plan' })
    }

    const amountString = price.toString();
    if (!process.env.CRYPTO_BOT_TOKEN) {
      console.error('CRYPTO_BOT_TOKEN is undefined')
      return res.status(500).json({
        ok: false,
        description: 'CryptoBot token not configured on server'
      })
    }
    const CRYPTO_API_URL = (process.env.CRYPTO_BOT_TOKEN && process.env.CRYPTO_BOT_TOKEN.toLowerCase().startsWith('test')) 
        ? 'https://testnet-pay.crypt.bot/api/createInvoice'
        : 'https://pay.crypt.bot/api/createInvoice';

    console.log(`Creating invoice for ${userId} via ${CRYPTO_API_URL}`);

    const response = await fetch(CRYPTO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Crypto-Pay-API-Token': process.env.CRYPTO_BOT_TOKEN
      },
      body: JSON.stringify({
        asset: 'USDT',
        amount: amountString,
        description: `Подписка на ${plan} дней`,
        payload: `uid:${userId}|plan:${plan}|renew:${isRenewal}`,
        allow_anonymous: false,
        expires_in: 900
      })
    })

    const data = await response.json()

    if (!data.ok) {
      console.error('CryptoBot Error:', JSON.stringify(data));
      return res.status(400).json({ 
        ok: false, 
        description: data.error?.name || 'CryptoBot API Error' 
      });
    }

    res.json(data)

  } catch (err) {
    console.error('Crypto invoice error:', err)
    res.status(500).json({ ok: false, description: 'Internal Server Error' })
  }
})

app.post('/api/check-crypto-status', async (req, res) => {
    try {
        const { invoiceId } = req.body;

        const CRYPTO_API_URL = (process.env.CRYPTO_BOT_TOKEN && process.env.CRYPTO_BOT_TOKEN.toLowerCase().startsWith('test')) 
        ? 'https://testnet-pay.crypt.bot/api/getInvoices'
        : 'https://pay.crypt.bot/api/getInvoices';

        const response = await fetch(CRYPTO_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Crypto-Pay-API-Token': process.env.CRYPTO_BOT_TOKEN
            },
            body: JSON.stringify({
                invoice_ids: invoiceId
            })
        });

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error('Check status error:', error);
        res.status(500).json({ ok: false });
    }
});

bot.on('pre_checkout_query', async (query) => {
  await bot.answerPreCheckoutQuery(query.id, true).catch(err => {
    console.error('Pre-checkout error:', err)
  })
})

function isPrivateChat(msg) {
  return msg && msg.chat && msg.chat.type === 'private'
}

bot.onText(/\/start/, async (msg) => {
  if (!isPrivateChat(msg)) return
  const chatId = msg.chat.id
  const userId = msg.from.id

  try {
    const registered = await registerUser(msg)

    if (registered) {
      showMainMenu(chatId)
    } else {
      await bot.sendMessage(chatId, 'Произошла ошибка при регистрации. Попробуйте позже.')
    }

  } catch (error) {
    console.error('Error in /start:', error)
    await bot.sendMessage(chatId, 'Произошла ошибка. Пожалуйста, попробуйте позже.')
  }
})

bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id
  const data = callbackQuery.data
  const userId = callbackQuery.from.id

  console.log(`Callback from ${userId}: ${data}`)

  try {
    await bot.deleteMessage(chatId, callbackQuery.message.message_id)
      .catch(err => console.log('Cannot delete message:', err.message))

    switch(data) {
      case 'support_request':
        showSupportMenu(chatId)
        break

      case 'support_payment':
        await handleSupportTopic(chatId, userId, 'Оплата товара')
        break

      case 'support_helper':
        await handleSupportTopic(chatId, userId, 'Проблемы с Helper\'ом')
        break

      case 'support_suggestions':
        await handleSupportTopic(chatId, userId, 'Предложения по улучшению')
        break

      case 'support_other':
        await handleSupportTopic(chatId, userId, 'Другое')
        break

      default:
        await bot.sendMessage(chatId, 'Неизвестная команда')
        showMainMenu(chatId)
    }

    await bot.answerCallbackQuery(callbackQuery.id)

  } catch (error) {
    console.error('Error in callback:', error)
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Произошла ошибка' })
  }
})

async function handleSupportTopic(chatId, userId, topic) {
  await saveSupportChoice(chatId, userId, topic)

  const message = `Вы выбрали тему: *${topic}*\n\n` +
    `*Опишите вашу проблему или вопрос*\n` +
    `Просто напишите сообщение, и администратор свяжется с вами в ближайшее время.`

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
}

async function saveSupportChoice(chatId, userId, topic) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('telegram, name')
      .eq('idtg', userId)
      .single()

    const username = user?.telegram || 'null'
    const fullName = user?.name || 'Пользователь'

    const { error: insertError } = await supabase
      .from('support_messages')
      .insert({
        chat_id: chatId,
        sender: 'user',
        message: `Тема: ${topic}`,
        username: username,
        full_name: fullName,
        sent_to_user: true,
        topic: topic
      })

    if (insertError) {
      console.error('Error saving support choice:', insertError)
    } else {
      await notifyAdminsAboutNewTicket(userId, username, fullName, topic)
    }

  } catch (error) {
    console.error('Error in saveSupportChoice:', error)
  }
}

bot.on('photo', async (msg) => {
  if (!isPrivateChat(msg)) return
  await handleMediaMessage(msg, 'photo')
})

bot.on('document', async (msg) => {
  if (!isPrivateChat(msg)) return
  await handleMediaMessage(msg, 'document')
})

async function handleMediaMessage(msg, mediaType) {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const username = msg.from.username ? `@${msg.from.username}` : 'null'
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim()

  try {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('idtg', userId)
      .single()

    if (!user) {
      await bot.sendMessage(chatId, 
        'Для использования поддержки необходимо зарегистрироваться.\n' +
        'Нажмите /start для регистрации.'
      )
      return
    }

    let fileId, fileSize, fileName, mimeType, caption = ''

    if (mediaType === 'photo') {
      const photos = msg.photo
      const photo = photos[photos.length - 1]
      fileId = photo.file_id
      fileSize = photo.file_size
      mimeType = 'image/jpeg'
      caption = msg.caption || ''
    } else if (mediaType === 'document') {
      const doc = msg.document
      fileId = doc.file_id
      fileSize = doc.file_size
      fileName = doc.file_name
      mimeType = doc.mime_type
      caption = msg.caption || ''
    }

    const fileLink = await bot.getFileLink(fileId)

    const { error } = await supabase
      .from('support_messages')
      .insert({
        chat_id: chatId,
        sender: 'user',
        message: caption || `[${mediaType === 'photo' ? 'Фото' : 'Файл'}]`,
        username: username,
        full_name: fullName,
        sent_to_user: true,
        media_type: mediaType,
        file_id: fileId,
        file_url: fileLink,
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType
      })

    if (error) {
      console.error('Error saving media message:', error)
      return
    }

    console.log(`📸 ${mediaType} saved from ${userId}`)

    const { data: lastTopic } = await supabase
      .from('support_messages')
      .select('topic')
      .eq('chat_id', chatId)
      .eq('sender', 'user')
      .not('topic', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const topic = lastTopic?.topic || 'Не указана'

    await notifyAdminsAboutMedia(userId, username, fullName, mediaType, caption, topic)

  } catch (error) {
    console.error(`Error handling ${mediaType}:`, error)
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке файла.')
  }
}

async function notifyAdminsAboutMedia(userId, username, fullName, mediaType, caption, topic) {
  try {
    const safeUsername = username.replace(/\*/g, '')
    const safeCaption = (caption || '')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/`/g, '\\`')

    const mediaTypeText = mediaType === 'photo' ? 'Фото' : 'Файл'
    const captionText = caption ? `\nТекст: ${safeCaption}` : ''

    const message = `*Новое медиа-сообщение*\n\n` +
      `${fullName}\n` +
      `${safeUsername}\n` +
      `${userId}\n` +
      `${topic}\n` +
      `${mediaTypeText}${captionText}\n` +
      `${new Date().toLocaleString('ru-RU')}`

    for (const adminId of ADMIN_IDS) {
      try {
        await bot.sendMessage(adminId, message, { parse_mode: 'Markdown' })
      } catch (error) {
        if (error.response?.body?.description?.includes('parse entities')) {
          const plainMessage = message.replace(/\*/g, '')
          await bot.sendMessage(adminId, plainMessage)
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } catch (error) {
    console.error('Error in notifyAdminsAboutMedia:', error)
  }
}

async function checkAndSendAdminMessages() {
  if (isProcessing || rateLimitDelay > 0) return

  isProcessing = true

  try {

    const { data: messages, error } = await supabase
      .from('support_messages')
      .select('*')
      .eq('sender', 'admin')
      .eq('sent_to_user', false)
      .order('created_at', { ascending: true })
      .limit(5)

    if (error) {
      console.error('Ошибка получения сообщений:', error)
      return
    }

    if (!messages || messages.length === 0) {
      return
    }


    for (const msg of messages) {
      try {
        if (!msg.message && !msg.media_type) {
          await supabase
            .from('support_messages')
            .update({ sent_to_user: true })
            .eq('id', msg.id)
          continue
        }

        if (rateLimitDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, rateLimitDelay * 1000))
          rateLimitDelay = 0
        }

        let sentSuccessfully = false

        if (msg.media_type && msg.file_url) {
          await sendMediaToUser(msg)
          sentSuccessfully = true
        } else if (msg.message && msg.message.trim()) {
          const messageText = msg.message.trim()
          await bot.sendMessage(msg.chat_id, messageText, {
            parse_mode: 'Markdown'
          })
          sentSuccessfully = true
        }

        if (sentSuccessfully) {
          const { error: updateError } = await supabase
            .from('support_messages')
            .update({ 
              sent_to_user: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', msg.id)

          if (updateError) {
            console.error('Ошибка обновления статуса:', updateError)
          } else {
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (telegramError) {
        console.error(`Ошибка отправки пользователю ${msg.chat_id}:`, {
          error: telegramError.message,
          response: telegramError.response?.body,
          statusCode: telegramError.response?.statusCode
        })

        if (telegramError.response?.statusCode === 429) {
          rateLimitDelay = telegramError.response.body?.parameters?.retry_after || 20
          break
        }

        if (telegramError.response?.statusCode === 403) {
          await supabase
            .from('support_messages')
            .update({ sent_to_user: true })
            .eq('id', msg.id)
        } else if (telegramError.response?.statusCode === 400) {
          await supabase
            .from('support_messages')
            .update({ sent_to_user: true })
            .eq('id', msg.id)
        }
      }
    }

  } catch (error) {
    console.error('Ошибка в checkAndSendAdminMessages:', error)
  } finally {
    isProcessing = false
  }
}

async function sendMediaToUser(msg) {
  const chatId = msg.chat_id
  const caption = msg.message || ''

  try {
    if (msg.media_type === 'photo') {
      await bot.sendPhoto(chatId, msg.file_url, {
        caption: caption,
        parse_mode: 'Markdown'
      })
    } else if (msg.media_type === 'document') {
      await bot.sendDocument(chatId, msg.file_url, {
        caption: caption,
        parse_mode: 'Markdown'
      })
    }
  } catch (error) {
    if (error.code === 'ETELEGRAM' || error.response?.statusCode === 400) {
      await bot.sendMessage(chatId, 
        `[Медиа-файл]\n${caption}`,
        { parse_mode: 'Markdown' }
      )
    } else {
      throw error
    }
  }
}

bot.on('message', async (msg) => {
  if (!isPrivateChat(msg)) return

  if (msg.successful_payment) {
    const payment = msg.successful_payment
    const currency = payment.currency
    const amount = payment.total_amount

    let payloadData
    try {
      payloadData = JSON.parse(payment.invoice_payload)
    } catch (e) {
      console.error('Error parsing payload', e)
      return
    }

    const { userId, plan, isRenewal } = payloadData

    console.log(`Payment received: User ${userId}, Plan ${plan} days, Amount ${amount} ${currency}`)

    try {
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('daysgov')
        .eq('idtg', userId)
        .single()

      if (fetchError) throw fetchError

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      let startDate = today
      if (userData && userData.daysgov) {
        const currentExpiry = new Date(userData.daysgov)
        if (currentExpiry > today) {
          startDate = currentExpiry
        }
      }

      const newDate = new Date(startDate)
      newDate.setDate(newDate.getDate() + parseInt(plan))
      const newExpiryString = newDate.toISOString().split('T')[0]

      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          daysgov: newExpiryString,
          buykov: amount,
          status: 'active'
        })
        .eq('idtg', userId)

      if (updateError) throw updateError

      await bot.sendMessage(msg.chat.id, 
        `*Оплата прошла успешно!*\n\nВаша подписка продлена на *${plan} дней*.\nДействует до: ${new Date(newExpiryString).toLocaleDateString('ru-RU')}`, 
        { parse_mode: 'Markdown' }
      )

      for (const adminId of ADMIN_IDS) {
        bot.sendMessage(adminId, `*Новая продажа (Stars)*\nUser ID: ${userId}\nPlan: ${plan} days\nAmount: ${amount} XTR`, { parse_mode: 'Markdown' })
      }

    } catch (error) {
      console.error('Database update error after payment:', error)
      await bot.sendMessage(msg.chat.id, 'Оплата прошла, но возникла ошибка при активации. Пожалуйста, напишите в поддержку.')
    }
    return
  }

  if (msg.text?.startsWith('/')) return
  if (msg.photo || msg.document) return

  const chatId = msg.chat.id
  const text = msg.text || ''
  const userId = msg.from.id
  const username = msg.from.username ? `@${msg.from.username}` : 'null'
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim()

  if (!text) return

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('idtg', userId)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      console.error('Error checking user registration:', userError)
      await bot.sendMessage(chatId, 'Пожалуйста, сначала используйте команду /start')
      return
    }

    if (!user) {
      await bot.sendMessage(chatId, 
        'Для использования поддержки необходимо зарегистрироваться.\n' +
        'Нажмите /start для регистрации.'
      )
      return
    }

    const { data: insertedData, error } = await supabase
      .from('support_messages')
      .insert({
        chat_id: chatId,
        sender: 'user',
        message: text,
        username: username,
        full_name: fullName,
        sent_to_user: true
      })
      .select()

    if (error) {
      console.error('Error saving support message:', error)
      await bot.sendMessage(chatId, 'Ошибка сохранения сообщения. Попробуйте позже.')
      return
    }

    const { data: lastTopic } = await supabase
      .from('support_messages')
      .select('topic')
      .eq('chat_id', chatId)
      .eq('sender', 'user')
      .not('topic', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const topic = lastTopic?.topic || 'Не указана'

    await notifyAdminsAboutNewMessage(userId, username, fullName, text, topic)

  } catch (error) {
    console.error('Error processing message:', error)
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.')
  }
})

async function notifyAdminsAboutNewMessage(userId, username, fullName, messageText, topic = 'Не указана') {
  try {
    const safeUsername = username.replace(/\*/g, '')
    const safeMessage = messageText
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/`/g, '\\`')

    const truncatedMessage = safeMessage.length > 100 ? 
      safeMessage.substring(0, 100) + '...' : 
      safeMessage

    const message = `*Новое сообщения*\n\n` +
      `${fullName}\n` +
      `${safeUsername}\n` +
      `${userId}\n` +
      `${topic}\n` +
      `${truncatedMessage}\n` +
      `${new Date().toLocaleString('ru-RU')}`

    for (const adminId of ADMIN_IDS) {
      try {
        await bot.sendMessage(adminId, message, { parse_mode: 'Markdown' })
      } catch (error) {
        if (error.response?.body?.description?.includes('parse entities')) {
          const plainMessage = message.replace(/\*/g, '')
          await bot.sendMessage(adminId, plainMessage)
        } else {
          console.error(`Ошибка отправки админу ${adminId}:`, error.message)
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } catch (error) {
    console.error('Error in notifyAdminsAboutNewMessage:', error)
  }
}

async function notifyAdminsAboutNewTicket(userId, username, fullName, topic) {
  try {
    const safeUsername = username.replace(/\*/g, '')

    const message = `*Новое сообщения*\n\n` +
      `${fullName}\n` +
      `${safeUsername}\n` + 
      `${userId}\n` +
      `${topic}\n` +
      `${new Date().toLocaleString('ru-RU')}`

    for (const adminId of ADMIN_IDS) {
      try {
        await bot.sendMessage(adminId, message, { parse_mode: 'Markdown' })
      } catch (error) {
        if (error.response?.body?.description?.includes('parse entities')) {
          const plainMessage = message.replace(/\*/g, '')
          await bot.sendMessage(adminId, plainMessage)
        } else {
          console.error(`Ошибка отправки админу ${adminId}:`, error.message)
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } catch (error) {
    console.error('Error in notifyAdmins:', error)
  }
}

setInterval(checkAndSendAdminMessages, 5000)

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message)
})

bot.on('webhook_error', (error) => {
  console.error('Webhook error:', error.message)
})

process.on('SIGINT', () => {
  console.log('Shutting down bot...')
  bot.stopPolling()
  process.exit()
})

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});
