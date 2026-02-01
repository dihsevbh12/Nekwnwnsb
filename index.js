import TelegramBot from 'node-telegram-bot-api'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config()


// === Supabase ===
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// === Telegram ===
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true
})

console.log('🤖 Bot started')

// === Генерация ключа ===
function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let key = ''
  for (let i = 0; i < 15; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return key
}

// === Администраторы ===
const ADMIN_IDS = [7660364996, 8050370935] // Замените на реальные ID админов

// === Функция регистрации пользователя ===
async function registerUser(msg) {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const username = msg.from.username ? `@${msg.from.username}` : 'null'
  const firstName = msg.from.first_name || ''
  const lastName = msg.from.last_name || ''
  const fullName = `${firstName} ${lastName}`.trim() || null

  try {
    // Проверяем, есть ли пользователь в базе
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('idtg', userId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error checking user:', checkError)
      return false
    }

    if (existingUser) {
      console.log(`User ${userId} already exists`)
      return true
    }

    // Генерируем ключ
    const key = generateKey()

    // Создаем нового пользователя
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
        registration_date: new Date().toISOString().split('T')[0]
      })

    if (insertError) {
      console.error('Error creating user:', insertError)
      return false
    }

    console.log(`✅ New user registered: ${userId}, key: ${key}`)
    return true

  } catch (error) {
    console.error('Error in registerUser:', error)
    return false
  }
}

// === Главное меню ===
function showMainMenu(chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть приложение',
            web_app: { url: 'https://rogers1234556.github.io/Modele-/' } // Замените на ваш URL
          }
        ],
        [
          {
            text: 'Наш канал',
            url: 'https://t.me/mr_helpers' // Замените на ваш канал
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

// === Меню поддержки ===
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
            text: 'Проблемы с Helper’ом',
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

// === Обработка команды /start ===
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id

  console.log(`/start command from ${userId}`)

  try {
    // Регистрируем пользователя
    const registered = await registerUser(msg)

    if (registered) {
      // Показываем главное меню
      showMainMenu(chatId)
    } else {
      await bot.sendMessage(chatId, 'Произошла ошибка при регистрации. Попробуйте позже.')
    }

  } catch (error) {
    console.error('Error in /start:', error)
    await bot.sendMessage(chatId, 'Произошла ошибка. Пожалуйста, попробуйте позже.')
  }
})

// === Обработка callback запросов ===
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id
  const data = callbackQuery.data
  const userId = callbackQuery.from.id

  console.log(`Callback from ${userId}: ${data}`)

  try {
    // Удаляем предыдущее сообщение (опционально)
    await bot.deleteMessage(chatId, callbackQuery.message.message_id)
      .catch(err => console.log('Cannot delete message:', err.message))

    switch(data) {
      case 'support_request':
        // Показываем меню поддержки
        showSupportMenu(chatId)
        break

      case 'support_payment':
        await handleSupportTopic(chatId, userId, 'Оплата товара')
        break

      case 'support_helper':
        await handleSupportTopic(chatId, userId, 'Проблемы с Helper’ом')
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

    // Подтверждаем callback
    await bot.answerCallbackQuery(callbackQuery.id)

  } catch (error) {
    console.error('Error in callback:', error)
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Произошла ошибка' })
  }
})

// === Обработка темы поддержки ===
async function handleSupportTopic(chatId, userId, topic) {
  // Сохраняем выбор темы
  await saveSupportChoice(chatId, userId, topic)

  const message = `Вы выбрали тему: *${topic}*\n\n` +
    `*Опишите вашу проблему или вопрос*\n` +
    `Просто напишите сообщение, и администратор свяжется с вами в ближайшее время. Для закрытия чата с поддержкой используйте /start`

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
}

// === Сохранение выбора темы ===
async function saveSupportChoice(chatId, userId, topic) {
  try {
    // Получаем информацию о пользователе
    const { data: user, error } = await supabase
      .from('users')
      .select('telegram, name')
      .eq('idtg', userId)
      .single()

    const username = user?.telegram || 'null'
    const fullName = user?.name || 'Пользователь'

    // Сохраняем начальное сообщение поддержки
    const { error: insertError } = await supabase
      .from('support_messages')
      .insert({
        chat_id: chatId,
        sender: 'user',
        message: `Тема: ${topic}`,
        username: username,
        full_name: fullName,
        sent_to_user: true,
        topic: topic // Добавляем тему
      })

    if (insertError) {
      console.error('Error saving support choice:', insertError)
    } else {
      // Отправляем уведомление админам
      await notifyAdminsAboutNewTicket(userId, username, fullName, topic)
    }

  } catch (error) {
    console.error('Error in saveSupportChoice:', error)
  }
}

// === Обработка фото ===
bot.on('photo', async (msg) => {
  await handleMediaMessage(msg, 'photo')
})

// === Обработка документов ===
bot.on('document', async (msg) => {
  await handleMediaMessage(msg, 'document')
})

// === Общая функция для медиа ===
async function handleMediaMessage(msg, mediaType) {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const username = msg.from.username ? `@${msg.from.username}` : 'null'
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim()

  try {
    // Проверяем, зарегистрирован ли пользователь
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

    // Получаем информацию о файле
    let fileId, fileSize, fileName, mimeType, caption = ''

    if (mediaType === 'photo') {
      // Берем последнюю (самую качественную) фото
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

    // Получаем direct ссылку на файл
    const fileLink = await bot.getFileLink(fileId)

    // Сохраняем в базу данных
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

    // Отправляем уведомление админам
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

    // Уведомляем админов
    await notifyAdminsAboutMedia(userId, username, fullName, mediaType, caption, topic)

  } catch (error) {
    console.error(`Error handling ${mediaType}:`, error)
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке файла.')
  }
}

// === Уведомление админов о медиа ===
async function notifyAdminsAboutMedia(userId, username, fullName, mediaType, caption, topic) {
  try {
    const safeUsername = username.replace(/\*/g, '')
    const safeCaption = (caption || '')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/`/g, '\\`')

    const mediaTypeText = mediaType === 'photo' ? '📷 Фото' : '📄 Файл'
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

// === Проверка и отправка ответов администраторов ===
async function checkAndSendAdminMessages() {
  if (isProcessing || rateLimitDelay > 0) return

  isProcessing = true

  try {
    console.log('🔍 Проверяем сообщения от админов для отправки пользователям...')

    // Получаем сообщения от админов, которые еще не отправлены пользователям
    const { data: messages, error } = await supabase
      .from('support_messages')
      .select('*')
      .eq('sender', 'admin')
      .eq('sent_to_user', false)
      .order('created_at', { ascending: true })
      .limit(5) // Увеличим лимит

    if (error) {
      console.error('❌ Ошибка получения сообщений:', error)
      return
    }

    if (!messages || messages.length === 0) {
      console.log('📭 Нет сообщений для отправки')
      return
    }

    console.log(`📨 Найдено ${messages.length} сообщений для отправки`)

    for (const msg of messages) {
      try {
        // Проверяем, что сообщение не пустое
        if (!msg.message && !msg.media_type) {
          console.log(`⚠️ Пропускаем пустое сообщение ID: ${msg.id}`)
          // Помечаем как отправленное
          await supabase
            .from('support_messages')
            .update({ sent_to_user: true })
            .eq('id', msg.id)
          continue
        }

        // Ждем если есть rate limit
        if (rateLimitDelay > 0) {
          console.log(`⏳ Rate limit delay: ${rateLimitDelay}s`)
          await new Promise(resolve => setTimeout(resolve, rateLimitDelay * 1000))
          rateLimitDelay = 0
        }

        console.log(`📤 Отправляем сообщение ${msg.id} пользователю ${msg.chat_id}:`, {
          hasText: !!msg.message,
          hasMedia: !!msg.media_type,
          messagePreview: msg.message ? msg.message.substring(0, 50) + '...' : 'нет текста'
        })

        // Отправляем сообщение пользователю
        let sentSuccessfully = false

        if (msg.media_type && msg.file_url) {
          // Отправляем медиа
          await sendMediaToUser(msg)
          sentSuccessfully = true
        } else if (msg.message && msg.message.trim()) {
          // Отправляем текстовое сообщение
          const messageText = msg.message.trim()
          await bot.sendMessage(msg.chat_id, messageText, {
            parse_mode: 'Markdown'
          })
          sentSuccessfully = true
        }

        // Помечаем как отправленное если успешно
        if (sentSuccessfully) {
          const { error: updateError } = await supabase
            .from('support_messages')
            .update({ 
              sent_to_user: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', msg.id)

          if (updateError) {
            console.error('❌ Ошибка обновления статуса:', updateError)
          } else {
            console.log(`✅ Сообщение ${msg.id} успешно отправлено пользователю ${msg.chat_id}`)
          }
        }

        // Задержка между сообщениями
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (telegramError) {
        console.error(`❌ Ошибка отправки пользователю ${msg.chat_id}:`, {
          error: telegramError.message,
          response: telegramError.response?.body,
          statusCode: telegramError.response?.statusCode
        })

        // Обработка rate limiting
        if (telegramError.response?.statusCode === 429) {
          rateLimitDelay = telegramError.response.body?.parameters?.retry_after || 20
          console.log(`⚠️ Rate limit! Ждем ${rateLimitDelay}s`)
          break
        }

        // Если пользователь заблокировал бота
        if (telegramError.response?.statusCode === 403) {
          console.log(`❌ Пользователь ${msg.chat_id} заблокировал бота`)
          // Помечаем как отправленное чтобы не пытаться снова
          await supabase
            .from('support_messages')
            .update({ sent_to_user: true })
            .eq('id', msg.id)
        } else if (telegramError.response?.statusCode === 400) {
          console.log(`⚠️ Bad Request для ${msg.chat_id}:`, telegramError.response.body)
          // Помечаем как отправленное если ошибка 400
          await supabase
            .from('support_messages')
            .update({ sent_to_user: true })
            .eq('id', msg.id)
        }
      }
    }

  } catch (error) {
    console.error('❌ Ошибка в checkAndSendAdminMessages:', error)
  } finally {
    isProcessing = false
  }
}

// === Функция отправки медиа пользователю ===
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
    // Если файл недоступен, отправляем текстовое сообщение
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

// === Получение текстовых сообщений (для поддержки) ===
bot.on('message', async (msg) => {
  // Игнорируем команды и служебные сообщения
  if (msg.text?.startsWith('/')) return

  const chatId = msg.chat.id
  const text = msg.text || ''
  const userId = msg.from.id
  const username = msg.from.username ? `@${msg.from.username}` : 'null'
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim()

  if (!text) return

  try {
    // Проверяем, зарегистрирован ли пользователь
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
      // Пользователь не зарегистрирован - предлагаем /start
      await bot.sendMessage(chatId, 
        'Для использования поддержки необходимо зарегистрироваться.\n' +
        'Нажмите /start для регистрации.'
      )
      return
    }

    // Сохраняем сообщение в поддержку
    // Сохраняем сообщение в поддержку
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
      .select()  // Получаем ВСЕ поля

    if (error) {
      console.error('Error saving support message:', error)
      await bot.sendMessage(chatId, 'Ошибка сохранения сообщения. Попробуйте позже.')
      return
    }

    console.log(`📥 Support message from ${userId} saved`)

    // Получаем тему из последнего сообщения этого пользователя
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

    // Отправляем уведомление админам о новом сообщении
    await notifyAdminsAboutNewMessage(userId, username, fullName, text, topic)

    

  } catch (error) {
    console.error('Error processing message:', error)
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.')
  }
})

// === Rate Limiting для Telegram API ===
let rateLimitDelay = 0
let isProcessing = false

// === Уведомление админов о новом сообщении ===
async function notifyAdminsAboutNewMessage(userId, username, fullName, messageText, topic = 'Не указана') {
  try {
    // Убираем * из username
    const safeUsername = username.replace(/\*/g, '')
    // Экранируем специальные символы Markdown в сообщении
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

    // Отправляем каждому админу
    for (const adminId of ADMIN_IDS) {
      try {
        await bot.sendMessage(adminId, message, { parse_mode: 'Markdown' })
      } catch (error) {
        // Если ошибка парсинга Markdown, отправляем без форматирования
        if (error.response?.body?.description?.includes('parse entities')) {
          const plainMessage = message.replace(/\*/g, '')
          await bot.sendMessage(adminId, plainMessage)
        } else {
          console.error(`Ошибка отправки админу ${adminId}:`, error.message)
        }
      }
      // Небольшая задержка между отправками
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } catch (error) {
    console.error('Error in notifyAdminsAboutNewMessage:', error)
  }
}
// === Уведомление админов о новой заявке ===
async function notifyAdminsAboutNewTicket(userId, username, fullName, topic) {
  try {
    // Убираем * из username, если он содержит специальные символы
    const safeUsername = username.replace(/\*/g, '')

    const message = `*Новое сообщения*\n\n` +
      `${fullName}\n` +
      `${safeUsername}\n` + 
      `${userId}\n` +
      `${topic}\n` +
      `${new Date().toLocaleString('ru-RU')}`

    // Отправляем каждому админу
    for (const adminId of ADMIN_IDS) {
      try {
        await bot.sendMessage(adminId, message, { parse_mode: 'Markdown' })
        console.log(`✅ Уведомление отправлено админу ${adminId}`)
      } catch (error) {
        // Если ошибка парсинга Markdown, отправляем без форматирования
        if (error.response?.body?.description?.includes('parse entities')) {
          const plainMessage = message.replace(/\*/g, '')
          await bot.sendMessage(adminId, plainMessage)
          console.log(`✅ Уведомление отправлено админу ${adminId} (без форматирования)`)
        } else {
          console.error(`Ошибка отправки админу ${adminId}:`, error.message)
        }
      }
      // Небольшая задержка между отправками
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } catch (error) {
    console.error('Error in notifyAdmins:', error)
  }
}

// === Периодическая проверка ответов администраторов ===
setInterval(checkAndSendAdminMessages, 5000)
console.log('⏰ Started message polling every 5 seconds')


// === Обработка ошибок бота ===
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message)
})

bot.on('webhook_error', (error) => {
  console.error('Webhook error:', error.message)
})

// === Graceful shutdown ===
process.on('SIGINT', () => {
  console.log('Shutting down bot...')
  bot.stopPolling()
  process.exit()
})

console.log('✅ Bot is ready and waiting for messages')
