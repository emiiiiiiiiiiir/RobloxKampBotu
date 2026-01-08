const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  EmbedBuilder, 
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require('discord.js');
const config = require('./config.json');
const robloxAPI = require('./src/roblox');
const fs = require('fs');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans
  ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

const ACCOUNT_LINKS_FILE = './account_links.json';
const PENDING_VERIFICATIONS_FILE = './pending_verifications.json';
const ACTIVE_TICKETS_FILE = './active_tickets.json';

// Hata embed oluşturucu
function createErrorEmbed(message) {
  return new EmbedBuilder()
    .setDescription(message)
    .setColor(0xED4245);
}

// Roblox API hata çevirici
function translateRobloxError(message) {
  if (!message) return 'Bilinmeyen hata';
  
  const translations = {
    'You cannot manage this member': 'Bu kişiyi yönetme yetkiniz yok! (Cookie hesabının rütbesi yetersiz)',
    'You cannot manage this member.': 'Bu kişiyi yönetme yetkiniz yok! (Cookie hesabının rütbesi yetersiz)',
    'User is not in group': 'Kullanıcı grupta değil',
    'Invalid role': 'Geçersiz rütbe',
    'Authorization has been denied for this request': 'Cookie geçersiz veya süresi dolmuş',
    'Token Validation Failed': 'Cookie geçersiz veya süresi dolmuş',
    'The user is invalid or does not exist': 'Kullanıcı geçersiz veya mevcut değil',
    'Group is locked': 'Grup kilitli',
    'Insufficient permissions': 'Yetersiz yetki'
  };
  
  return translations[message] || message;
}

function validateEnvironmentVariables() {
  const requiredVars = [
    { name: 'DISCORD_TOKEN', value: DISCORD_TOKEN },
    { name: 'DISCORD_CLIENT_ID', value: DISCORD_CLIENT_ID },
    { name: 'ROBLOX_COOKIE', value: ROBLOX_COOKIE }
  ];

  const missingVars = requiredVars.filter(v => !v.value);
  
  if (missingVars.length > 0) {
    console.error('HATA: Gerekli environment variable\'lar eksik:');
    missingVars.forEach(v => console.error(`  - ${v.name}`));
    console.error('\nLütfen Replit Secrets bölümünden bu değişkenleri ekleyin.');
    process.exit(1);
  }
  
  console.log('✓ Tüm environment variable\'lar mevcut');
}

function validateConfig() {
  const warnings = [];
  
  if (!config.groupId) {
    console.error('HATA: config.json içinde groupId tanımlanmamış!');
    process.exit(1);
  }
  
  if (!config.gameId) {
    warnings.push('gameId tanımlanmamış - /aktiflik-sorgu komutu çalışmayacak');
  }
  
  if (!config.adminRoleIds || !Array.isArray(config.adminRoleIds) || config.adminRoleIds.length === 0) {
    warnings.push('adminRoleIds tanımlanmamış veya boş - yasaklama komutları çalışmayacak');
  }
  
  if (config.branchGroups) {
    const placeholders = Object.entries(config.branchGroups)
      .filter(([_, id]) => id === 'GRUP_ID_BURAYA')
      .map(([branch]) => branch);
    
    if (placeholders.length > 0) {
      warnings.push(`Şu branş grupları için ID tanımlanmamış: ${placeholders.join(', ')}`);
    }
  }
  
  if (warnings.length > 0) {
    console.warn('\nKonfigürasyon Uyarıları:');
    warnings.forEach(w => console.warn(`  - ${w}`));
    console.warn('');
  } else {
    console.log('✓ Konfigürasyon geçerli');
  }
}

function loadAccountLinks() {
  try {
    if (fs.existsSync(ACCOUNT_LINKS_FILE)) {
      const data = fs.readFileSync(ACCOUNT_LINKS_FILE, 'utf8');
      if (!data || data.trim() === '') {
        console.warn('Hesap bağlantıları dosyası boş, yeni dosya oluşturuluyor...');
        return {};
      }
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Hesap bağlantıları yüklenirken hata:', error.message);
    console.warn('Bozuk dosya yedekleniyor ve yeni dosya oluşturuluyor...');
    try {
      if (fs.existsSync(ACCOUNT_LINKS_FILE)) {
        fs.copyFileSync(ACCOUNT_LINKS_FILE, `${ACCOUNT_LINKS_FILE}.backup-${Date.now()}`);
      }
    } catch (backupError) {
      console.error('Yedekleme hatası:', backupError.message);
    }
  }
  return {};
}

function saveAccountLinks(links) {
  try {
    fs.writeFileSync(ACCOUNT_LINKS_FILE, JSON.stringify(links, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Hesap bağlantıları kaydedilirken hata:', error);
    return false;
  }
}

function getLinkedRobloxUsername(discordUserId) {
  const links = loadAccountLinks();
  return links[discordUserId] || null;
}

function loadPendingVerifications() {
  try {
    if (fs.existsSync(PENDING_VERIFICATIONS_FILE)) {
      const data = fs.readFileSync(PENDING_VERIFICATIONS_FILE, 'utf8');
      if (!data || data.trim() === '') {
        console.warn('Bekleyen doğrulamalar dosyası boş, yeni dosya oluşturuluyor...');
        return {};
      }
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Bekleyen doğrulamalar yüklenirken hata:', error.message);
    console.warn('Bozuk dosya yedekleniyor ve yeni dosya oluşturuluyor...');
    try {
      if (fs.existsSync(PENDING_VERIFICATIONS_FILE)) {
        fs.copyFileSync(PENDING_VERIFICATIONS_FILE, `${PENDING_VERIFICATIONS_FILE}.backup-${Date.now()}`);
      }
    } catch (backupError) {
      console.error('Yedekleme hatası:', backupError.message);
    }
  }
  return {};
}

function savePendingVerifications(verifications) {
  try {
    fs.writeFileSync(PENDING_VERIFICATIONS_FILE, JSON.stringify(verifications, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Bekleyen doğrulamalar kaydedilirken hata:', error);
    return false;
  }
}

function generateVerificationCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function loadActiveTickets() {
  try {
    if (fs.existsSync(ACTIVE_TICKETS_FILE)) {
      const data = fs.readFileSync(ACTIVE_TICKETS_FILE, 'utf8');
      if (!data || data.trim() === '') {
        return {};
      }
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Aktif ticketlar yüklenirken hata:', error.message);
  }
  return {};
}

function saveActiveTickets(tickets) {
  try {
    fs.writeFileSync(ACTIVE_TICKETS_FILE, JSON.stringify(tickets, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Aktif ticketlar kaydedilirken hata:', error);
    return false;
  }
}

async function sendRankChangeWebhook(data) {
  if (!config.webhookUrl || config.webhookUrl === 'WEBHOOK_URL_BURAYA') {
    return;
  }
  
  try {
    const embed = {
      title: data.type === 'change' ? 'Rütbe Değişikliği' : 
             data.type === 'promotion' ? 'Terfi' : 
             data.type === 'demotion' ? 'Tenzil' : 
             'Branş Rütbe Değişikliği',
      color: data.type === 'promotion' ? 0x57F287 : 
             data.type === 'demotion' ? 0xED4245 : 
             0x5865F2,
      fields: [
        {
          name: 'Hedef Kullanıcı',
          value: data.targetUser,
          inline: true
        },
        {
          name: 'İşlemi Yapan',
          value: `${data.manager} (${data.managerRank})`,
          inline: true
        },
        {
          name: '\u200b',
          value: '\u200b',
          inline: true
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Rütbe Log Sistemi'
      }
    };
    
    if (data.oldRank) {
      embed.fields.push({
        name: 'Eski Rütbe',
        value: data.oldRank,
        inline: true
      });
    }
    
    embed.fields.push({
      name: 'Yeni Rütbe',
      value: data.newRank,
      inline: true
    });
    
    if (data.branch) {
      embed.fields.push({
        name: 'Branş',
        value: data.branch,
        inline: true
      });
    }
    
    if (data.reason) {
      embed.fields.push({
        name: 'Sebep',
        value: data.reason,
        inline: false
      });
    }
    
    await axios.post(config.webhookUrl, {
      embeds: [embed]
    });
  } catch (error) {
    console.error('Webhook gönderim hatası:', error.message);
  }
}

async function sendBranchRequestWebhook(data) {
  const webhookUrl = config.branchWebhookUrl && config.branchWebhookUrl !== 'WEBHOOK_URL_BURAYA' 
    ? config.branchWebhookUrl 
    : config.webhookUrl;
    
  if (!webhookUrl || webhookUrl === 'WEBHOOK_URL_BURAYA') {
    return;
  }
  
  try {
    const embed = {
      title: data.decision === 'kabul' ? 'Branş İsteği Kabul Edildi' : 'Branş İsteği Reddedildi',
      color: data.decision === 'kabul' ? 0x57F287 : 0xED4245,
      fields: [
        {
          name: 'Hedef Kullanıcı',
          value: data.targetUser,
          inline: true
        },
        {
          name: 'İşlemi Yapan',
          value: `${data.manager} (${data.managerRank})`,
          inline: true
        },
        {
          name: '\u200b',
          value: '\u200b',
          inline: true
        },
        {
          name: 'Branş',
          value: data.branch,
          inline: true
        },
        {
          name: 'Karar',
          value: data.decision === 'kabul' ? 'Kabul Edildi' : 'Reddedildi',
          inline: true
        },
        {
          name: '\u200b',
          value: '\u200b',
          inline: true
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Branş İstek Log Sistemi'
      }
    };
    
    if (data.reason) {
      embed.fields.push({
        name: 'Sebep',
        value: data.reason,
        inline: false
      });
    }
    
    await axios.post(webhookUrl, {
      embeds: [embed]
    });
  } catch (error) {
    console.error('Webhook gönderim hatası:', error.message);
  }
}

function cleanExpiredVerifications() {
  const verifications = loadPendingVerifications();
  const now = Date.now();
  const EXPIRY_TIME = 10 * 60 * 1000; // 10 dakika
  
  let changed = false;
  for (const userId in verifications) {
    if (now - verifications[userId].timestamp > EXPIRY_TIME) {
      delete verifications[userId];
      changed = true;
    }
  }
  
  if (changed) {
    savePendingVerifications(verifications);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('rütbe-sorgu')
    .setDescription('Kullanıcının Roblox grubundaki rütbesini sorgular')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Roblox kullanıcı adı')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('rütbe-değiştir')
    .setDescription('Belirtilen rütbeyi kullanıcıya verir')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Rütbe verilecek kişinin Roblox kullanıcı adı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('rütbe')
        .setDescription('Verilecek rütbe adı')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Rütbe değişikliği sebebi')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('rütbe-terfi')
    .setDescription('Kullanıcıya 1x terfi verir')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Terfi edilecek kişinin Roblox kullanıcı adı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Terfi sebebi')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('rütbe-tenzil')
    .setDescription('Kullanıcıya 1x tenzil verir')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Tenzil edilecek kişinin Roblox kullanıcı adı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Tenzil sebebi')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('tamyasak')
    .setDescription('Kullanıcıyı botun bulunduğu tüm sunuculardan yasaklar')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Discord kullanıcı ID\'si')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Yasaklama sebebi')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('tamyasak-kaldır')
    .setDescription('Kullanıcının botun bulunduğu tüm sunuculardan yasağını kaldırır')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Discord kullanıcı ID\'si')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Yasak kaldırma sebebi')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('aktiflik-sorgu')
    .setDescription('Grup oyununun aktifliğini sorgular'),
  
  new SlashCommandBuilder()
    .setName('yenile')
    .setDescription('RoWifi bilgilerini günceller/kaydeder'),
  new SlashCommandBuilder()
    .setName('branş-aktiflik-sorgu')
    .setDescription('Oyundaki tüm takımların aktiflik sayılarını gösterir'),
  new SlashCommandBuilder()
    .setName('oyun-yasakla')
    .setDescription('Kullanıcıyı Roblox oyunundan yasaklar')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Yasaklanacak kişinin Roblox kullanıcı adı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Yasaklama sebebi')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('oyun-yasak-kaldır')
    .setDescription('Bir kullanıcının oyun yasaklılar listesinden çıkarır')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Yasağı kaldırılacak kişinin Roblox kullanıcı adı')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('duyuru')
    .setDescription('Botun bulunduğu tüm sunuculara duyuru yapar')
    .addStringOption(option =>
      option.setName('mesaj')
        .setDescription('Duyuru mesajı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('kanal_adi')
        .setDescription('Duyurunun gönderileceği kanal adı (örn: duyurular, genel)')
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option.setName('görsel')
        .setDescription('Duyuruya eklenecek görsel (opsiyonel)')
        .setRequired(false)
    ),
  
  new SlashCommandBuilder()
    .setName('branştan-at')
    .setDescription('Kullanıcıyı bulunduğu branş grubundan atar')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Gruptan atılacak kişinin Roblox kullanıcı adı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Atılma sebebi')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Kullanıcının rütbesini en alt rütbeye çeker ve tüm branş gruplarından atar')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('İşlem yapılacak kişinin Roblox kullanıcı adı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Demote edilme sebebi')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Destek sistemi mesajını gönderir')
].map(command => command.toJSON());

console.log('=== Discord Bot Başlatılıyor ===\n');

validateEnvironmentVariables();
validateConfig();

console.log('\n=== Bot Başlatılıyor ===\n');

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

client.on('clientReady', async () => {
  console.log(`${client.user.tag} olarak giriş yapıldı`);
  console.log(`Grup ID: ${config.groupId}`);
  console.log(`Oyun ID: ${config.gameId}`);
  
  console.log('\nEski global komutlar siliniyor...');
  try {
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: [] });
    console.log('✓ Global komutlar temizlendi');
  } catch (error) {
    console.error('✗ Global komut temizleme hatası:', error.message);
  }
  
  console.log('\nSlash komutları kaydediliyor...');
  
  const guilds = client.guilds.cache;
  let successCount = 0;
  let failCount = 0;
  
  for (const [guildId, guild] of guilds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guildId),
        { body: commands }
      );
      console.log(`✓ ${guild.name} sunucusuna komutlar kaydedildi`);
      successCount++;
    } catch (error) {
      console.error(`✗ ${guild.name} sunucusuna komut kaydı hatası:`, error.message);
      failCount++;
    }
  }
  
  console.log(`\n=== Komut Kaydı Tamamlandı ===`);
  console.log(`Başarılı: ${successCount} sunucu`);
  console.log(`Başarısız: ${failCount} sunucu`);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    try {
      switch (commandName) {
        case 'rütbe-sorgu':
          await handleRankQuery(interaction);
          break;
        case 'rütbe-değiştir':
          await handleRankChange(interaction);
          break;
        case 'rütbe-terfi':
          await handleRankPromotion(interaction);
          break;
        case 'rütbe-tenzil':
          await handleRankDemotion(interaction);
          break;
        case 'tamyasak':
          await handleBan(interaction);
          break;
        case 'tamyasak-kaldır':
          await handleUnban(interaction);
          break;
        case 'aktiflik-sorgu':
          await handleActivityQuery(interaction);
          break;
        case 'yenile':
          await handleYenile(interaction);
          break;
        case 'branş-aktiflik-sorgu':
          await handleBranchActivityQuery(interaction);
          break;
        case 'grup-listele':
          await handleGroupList(interaction);
          break;
        case 'branş-istek':
          await handleBranchRequest(interaction);
          break;
        case 'branş-rütbe-değiştir':
          await handleBranchRankChange(interaction);
          break;
        case 'branştan-at':
          await handleBranchKick(interaction);
          break;
        case 'demote':
          await handleDemote(interaction);
          break;
        case 'oyun-yasakla':
          await handleGameBan(interaction);
          break;
        case 'oyun-yasak-kaldır':
          await handleGameUnban(interaction);
          break;
        case 'duyuru':
          await handleAnnouncement(interaction);
          break;
        case 'ticket-setup':
          await handleTicketSetup(interaction);
          break;
      }
    } catch (error) {
      if (error.code === 10062) {
        console.warn(`Etkileşim zaman aşımına uğradı (${commandName}), ancak işlem arka planda devam etmiş olabilir.`);
        return;
      }
      console.error(`Komut hatası (${commandName}):`, error);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'HATA: Bir hata oluştu!', 
            flags: 64
          });
        } else if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [createErrorEmbed('Bir hata oluştu!')] });
        }
      } catch (replyError) {
        if (replyError.code !== 10062) {
          console.error('Hata mesajı gönderilemedi:', replyError.message);
        }
      }
    }
  }
  else if (interaction.isAutocomplete()) {
    const { commandName } = interaction;
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'rütbe') {
      try {
        let groupId = config.groupId;
        
        if (commandName === 'branş-rütbe-değiştir') {
          const branch = interaction.options.getString('branş');
          if (branch && config.branchGroups[branch]) {
            groupId = config.branchGroups[branch];
          }
        }
        
        const roles = await robloxAPI.getGroupRoles(groupId);
        
        if (roles && roles.length > 0) {
          const filtered = roles
            .filter(role => role.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .sort((a, b) => b.rank - a.rank)
            .slice(0, 25)
            .map(role => ({
              name: role.name,
              value: role.name
            }));
          
          await interaction.respond(filtered);
        } else {
          await interaction.respond([]);
        }
      } catch (error) {
        console.error('Autocomplete hatası:', error.message);
        try {
          await interaction.respond([]);
        } catch (e) {
          // Zaten yanıtlanmış, yoksay
        }
      }
    }
  }
  else if (interaction.isButton()) {
    try {
      if (interaction.customId === 'open_ticket_menu') {
        await handleTicketMenuButton(interaction);
      } else if (interaction.customId === 'close_ticket') {
        await handleTicketClose(interaction);
      } else if (interaction.customId === 'claim_ticket') {
        await handleTicketClaim(interaction);
      } else if (interaction.customId.startsWith('verify_link_')) {
        await handleVerificationButton(interaction);
      } else if (interaction.customId.startsWith('rate_ticket_')) {
        const parts = interaction.customId.split('_');
        const rating = parseInt(parts[2]);
        const ticketOwnerId = parts[3];
        await handleTicketRating(interaction, rating, ticketOwnerId);
      }
    } catch (error) {
      console.error('Buton hatası:', error);
      await interaction.reply({ content: 'HATA: Bir hata oluştu!', flags: 64 }).catch(() => {});
    }
  }
  else if (interaction.isStringSelectMenu()) {
    try {
      if (interaction.customId === 'ticket_category') {
        await handleTicketCategorySelect(interaction);
      }
    } catch (error) {
      console.error('Select menu hatası:', error);
      await interaction.reply({ content: 'HATA: Bir hata oluştu!', flags: 64 }).catch(() => {});
    }
  }
});

async function handleTicketRating(interaction, rating, ticketOwnerId) {
  const parts = interaction.customId.split('_');
  const ticketId = parts[4];
  
  if (interaction.user.id !== ticketOwnerId) {
    return interaction.reply({ content: 'HATA: Sadece ticket sahibi puan verebilir!', flags: 64 });
  }

  const embed = new EmbedBuilder()
    .setTitle('Puanınız Kaydedildi')
    .setDescription(`Desteğimiz için **${rating} yıldız** verdiğiniz için teşekkür ederiz!`)
    .setColor(0x57F287)
    .setTimestamp();

  await interaction.update({ components: [] });
  await interaction.followUp({ embeds: [embed], flags: 64 });
  
  // Log kanalına puanı gönder
  if (config.ticketLogChannelId) {
    const logChannel = interaction.guild.channels.cache.get(config.ticketLogChannelId);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('Ticket Puanlandı')
        .addFields(
          { name: 'Kullanıcı', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Puan', value: '⭐'.repeat(rating), inline: true }
        )
        .setColor(0x5865F2)
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] });
    }
  }
}

async function handleVerificationButton(interaction) {
  await interaction.deferReply({ flags: 64 });
  const discordUserId = interaction.user.id;
  const verifications = loadPendingVerifications();
  const verification = verifications[discordUserId];

  if (!verification) {
    return interaction.editReply({ embeds: [createErrorEmbed('Bekleyen bir doğrulama işleminiz bulunmuyor.')] });
  }

  const isVerified = await robloxAPI.verifyUserOwnership(verification.robloxId, verification.code);

  if (isVerified) {
    const links = loadAccountLinks();
    links[discordUserId] = verification.username;
    
    if (saveAccountLinks(links)) {
      delete verifications[discordUserId];
      savePendingVerifications(verifications);

      const embed = new EmbedBuilder()
        .setTitle('Doğrulama Başarılı')
        .setDescription(`Roblox hesabınız (**${verification.username}**) başarıyla bot sistemine bağlandı.`)
        .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${verification.robloxId}&width=420&height=420&format=png`)
        .setColor(0x2B2D31)
        .setFooter({ text: 'Bağlantı Tamamlandı', iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({ embeds: [createErrorEmbed('Hesap kaydedilirken bir hata oluştu!')] });
    }
  } else {
    await interaction.editReply({ embeds: [createErrorEmbed('Doğrulama başarısız! Lütfen kodu profil açıklamanıza eklediğinizden emin olun.')] });
  }
}

async function checkRankPermissions(discordUserId, targetRank) {
  const managerUsername = getLinkedRobloxUsername(discordUserId);
  if (!managerUsername) {
    return { 
      allowed: false, 
      embed: createErrorEmbed('RoWifi ile hesabınızı doğrulamamışsınız veya bilgileriniz güncel değil. `/yenile` komutunu kullanarak bilgilerinizi güncelleyin.')
    };
  }

  const managerId = await robloxAPI.getUserIdByUsername(managerUsername);
  if (!managerId) {
    return { 
      allowed: false, 
      embed: createErrorEmbed('Bağlı Roblox kullanıcısı bulunamadı! `/yenile` komutunu kullanın.')
    };
  }

  const managerRank = await robloxAPI.getUserRankInGroup(managerId, config.groupId);
  if (!managerRank) {
    return { 
      allowed: false, 
      embed: createErrorEmbed('Grupta olmayan kişiler rütbe işlemi yapamaz!')
    };
  }

  // Yetkili rütbe seviyeleri
  const allowedRankValues = [35, 36, 37, 38, 39, 255];
  if (!allowedRankValues.includes(managerRank.rank)) {
    return { 
      allowed: false, 
      embed: createErrorEmbed(`Bu işlemi yapmak için yetkiniz yetersiz! (Rütbeniz: ${managerRank.name})`)
    };
  }

  if (targetRank !== undefined && targetRank >= managerRank.rank && managerRank.rank !== 255) {
    return { 
      allowed: false, 
      embed: createErrorEmbed(`Sizden üst veya sizinle aynı rütbede olan birine rütbe veremezsiniz!`)
    };
  }

  return { 
    allowed: true, 
    managerRank: managerRank,
    managerUsername: managerUsername,
    managerId: managerId
  };
}

async function checkAccountSync(interaction) {
  const discordUserId = interaction.user.id;
  const guildId = interaction.guildId;
  const rowifiToken = process.env.ROWIFI_API_TOKEN;

  // Botun kendi veritabanındaki (account_links.json) kullanıcı adını al
  const botUsername = getLinkedRobloxUsername(discordUserId);

  if (botUsername) {
    return { username: botUsername };
  }

  // Resmi RoWifi API üzerinden kontrol
  if (rowifiToken && rowifiToken !== 'ROWIFI_API_TOKEN_BURAYA') {
    try {
      const response = await axios.get(`https://api.rowifi.xyz/v3/guilds/${guildId}/members/${discordUserId}`, {
        headers: { 'Authorization': `Bot ${rowifiToken}` },
        timeout: 5000
      });

      if (response.data && response.data.roblox_id) {
        const robloxInfo = await robloxAPI.getUserInfo(response.data.roblox_id);
        if (robloxInfo) {
          // Otomatik kaydet
          const links = loadAccountLinks();
          links[discordUserId] = robloxInfo.name;
          saveAccountLinks(links);
          return { username: robloxInfo.name, robloxId: response.data.roblox_id };
        }
      }
    } catch (error) {
      console.error('checkAccountSync RoWifi API hatası:', error.response?.data || error.message);
    }
  }

  await interaction.editReply({ 
    embeds: [createErrorEmbed('RoWifi ile hesabınızı doğrulamamışsınız veya bilgileriniz güncel değil. `/yenile` komutunu kullanarak bilgilerinizi güncelleyin.')]
  });
  return null;
}

async function handleYenile(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const discordUserId = interaction.user.id;
  const guildId = interaction.guildId;
  const rowifiToken = process.env.ROWIFI_API_TOKEN;

  if (!rowifiToken || rowifiToken === 'ROWIFI_API_TOKEN_BURAYA') {
    return interaction.editReply({
      embeds: [createErrorEmbed('Sistemde RoWifi API Token tanımlanmamış. Lütfen yöneticiye başvurun.')]
    });
  }

  try {
    const response = await axios.get(`https://api.rowifi.xyz/v3/guilds/${guildId}/members/${discordUserId}`, {
      headers: { 'Authorization': `Bot ${rowifiToken}` },
      timeout: 5000
    });

    if (response.data && response.data.roblox_id) {
      const robloxInfo = await robloxAPI.getUserInfo(response.data.roblox_id);
      if (!robloxInfo) {
        return interaction.editReply({
          embeds: [createErrorEmbed('Roblox kullanıcı bilgileri alınamadı.')]
        });
      }

      const links = loadAccountLinks();
      links[discordUserId] = robloxInfo.name;
      saveAccountLinks(links);

      const embed = new EmbedBuilder()
        .setTitle('Hesap Yenilendi')
        .setDescription(`RoWifi üzerinden bağlı hesabınız başarıyla algılandı ve güncellendi.`)
        .addFields(
          { name: 'Roblox Kullanıcı Adı', value: `\`${robloxInfo.name}\``, inline: true },
          { name: 'Roblox ID', value: `\`${response.data.roblox_id}\``, inline: true },
          { name: 'Discord ID', value: `\`${discordUserId}\``, inline: true }
        )
        .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${response.data.roblox_id}&width=420&height=420&format=png`)
        .setColor(0x57F287)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({
        embeds: [createErrorEmbed('RoWifi üzerinde bağlı bir hesabınız bulunamadı. Lütfen önce RoWifi ile hesabınızı bağlayın.')]
      });
    }
  } catch (error) {
    console.error('Yenileme hatası:', error.response?.data || error.message);
    const errorDetail = error.response?.status === 403 ? 'Yetki hatası (403). Lütfen API Token\'ın doğru sunucuya ait olduğundan ve geçerli olduğundan emin olun.' : 'RoWifi bilgileri alınırken bir hata oluştu.';
    await interaction.editReply({
      embeds: [createErrorEmbed(errorDetail)]
    });
  }
}

async function handleRobloxChange(interaction) {
  return interaction.reply({ content: 'Bu komut kaldırıldı. Lütfen /yenile komutunu kullanın.', flags: 64 });
}

async function handleRobloxLink(interaction) {
  return interaction.reply({ content: 'Bu komut kaldırıldı. Lütfen /yenile komutunu kullanın.', flags: 64 });
}

async function handleRankQuery(interaction) {
  if (!interaction.guild.name.includes('AEK')) {
    return interaction.reply({ content: 'HATA: Bu komut sadece |AEK| Turkish Armed Forces\'a bağlı sunucularda kullanılabilir.', ephemeral: true });
  }
  
  await interaction.deferReply();
  
  if (!(await checkAccountSync(interaction))) return;

  const robloxNick = interaction.options.getString('kişi');
  const userId = await robloxAPI.getUserIdByUsername(robloxNick);
  
  if (!userId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı bulunamadı!')] });
  }
  
  const userInfo = await robloxAPI.getUserInfo(userId);
  const rankInfo = await robloxAPI.getUserRankInGroup(userId, config.groupId);
  
  if (!rankInfo) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı grupta değil!')] });
  }
  
  const embed = new EmbedBuilder()
    .setTitle('Rütbe Sorgusu')
    .setDescription(`**${robloxNick}** kullanıcısının rütbe bilgileri`)
    .addFields(
      { name: 'Roblox Kullanıcı Adı', value: userInfo.name, inline: true },
      { name: 'Roblox ID', value: userId.toString(), inline: true },
      { name: 'Rütbe', value: rankInfo.name, inline: true },
      { name: 'Rütbe Seviyesi', value: rankInfo.rank.toString(), inline: true }
    )
    .setColor(0x5865F2)
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleRankChange(interaction) {
  if (!interaction.guild.name.includes('AEK')) {
    return interaction.reply({ content: 'HATA: Bu komut sadece |AEK| Turkish Armed Forces\'a bağlı sunucularda kullanılabilir.', ephemeral: true });
  }
  
  await interaction.deferReply();
  
  if (!(await checkAccountSync(interaction))) return;

  const robloxNick = interaction.options.getString('kişi');
  const targetRankName = interaction.options.getString('rütbe');
  const reason = interaction.options.getString('sebep');
  
  const targetUserId = await robloxAPI.getUserIdByUsername(robloxNick);
  if (!targetUserId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Hedef kullanıcı bulunamadı!')] });
  }

  const roles = await robloxAPI.getGroupRoles(config.groupId);
  if (!roles) {
    return interaction.editReply({ embeds: [createErrorEmbed('Grup rütbeleri alınamadı!')] });
  }
  
  const targetRole = roles.find(r => r.name.toLowerCase() === targetRankName.toLowerCase());
  if (!targetRole) {
    return interaction.editReply({ embeds: [createErrorEmbed('Geçersiz rütbe adı!')] });
  }

  const permissionCheck = await checkRankPermissions(interaction.user.id, targetRole.rank);
  if (!permissionCheck.allowed) {
    return interaction.editReply({ embeds: [permissionCheck.embed] });
  }

  // Hedef kişinin rütbesini kontrol et
  const targetRank = await robloxAPI.getUserRankInGroup(targetUserId, config.groupId);
  if (targetRank && targetRank.rank >= permissionCheck.managerRank.rank && permissionCheck.managerRank.rank !== 255) {
    return interaction.editReply({ embeds: [createErrorEmbed('Sizden üst veya sizinle aynı rütbede olan birine işlem yapamazsınız!')] });
  }
  
  if (targetUserId === permissionCheck.managerId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kendi rütbeni değiştiremezsin!')] });
  }

  const result = await robloxAPI.setUserRole(targetUserId, config.groupId, targetRole.id, ROBLOX_COOKIE);
  
  if (result && !result.error) {
    const currentRank = targetRank;
    const userId = targetUserId;
    await sendRankChangeWebhook({
      type: 'change',
      targetUser: robloxNick,
      manager: permissionCheck.managerUsername,
      managerRank: permissionCheck.managerRank.name,
      oldRank: currentRank ? `${currentRank.name} (${currentRank.rank})` : 'Bilinmiyor',
      newRank: `${targetRole.name} (${targetRole.rank})`,
      reason: reason
    });
    
    const oldRankText = currentRank ? currentRank.name : 'Bilinmiyor';
    const embed = new EmbedBuilder()
      .setDescription(`İşlem başarıyla tamamlandı\n\n${robloxNick} (${userId}) kişisini, ${oldRankText} rütbesinden ${targetRole.name} rütbesine başarıyla değiştirdin.\n\n**Sebep**\n${reason}`)
      .setColor(0x57F287);
    
    await interaction.editReply({ embeds: [embed] });
  } else {
    const errorMsg = translateRobloxError(result?.error?.errors?.[0]?.message || result?.error);
    await interaction.editReply({ embeds: [createErrorEmbed(`Rütbe değiştirilemedi! ${errorMsg}`)] });
  }
}

async function handleRankPromotion(interaction) {
  if (!interaction.guild.name.includes('AEK')) {
    return interaction.reply({ content: 'HATA: Bu komut sadece |AEK| Turkish Armed Forces\'a bağlı sunucularda kullanılabilir.', ephemeral: true });
  }
  
  await interaction.deferReply();
  
  if (!(await checkAccountSync(interaction))) return;

  const robloxNick = interaction.options.getString('kişi');
  const reason = interaction.options.getString('sebep');
  const userId = await robloxAPI.getUserIdByUsername(robloxNick);
  
  if (!userId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Hedef kullanıcı bulunamadı!')] });
  }
  
  const currentRank = await robloxAPI.getUserRankInGroup(userId, config.groupId);
  if (!currentRank) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı grupta değil!')] });
  }
  
  const roles = await robloxAPI.getGroupRoles(config.groupId);
  if (!roles) {
    return interaction.editReply({ embeds: [createErrorEmbed('Grup rütbeleri alınamadı! Grup ID\'sini kontrol edin.')] });
  }
  
  const sortedRoles = roles.sort((a, b) => a.rank - b.rank);
  const currentIndex = sortedRoles.findIndex(r => r.rank === currentRank.rank);
  
  if (currentIndex === sortedRoles.length - 1) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı zaten en üst rütbede!')] });
  }
  
  const nextRole = sortedRoles[currentIndex + 1];
  
  const permissionCheck = await checkRankPermissions(interaction.user.id, nextRole.rank);
  if (!permissionCheck.allowed) {
    return interaction.editReply({ embeds: [permissionCheck.embed] });
  }
  
  // Kendi rütbesini değiştirmeyi engelle
  if (userId === permissionCheck.managerId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kendi rütbenizi değiştiremezsiniz!')] });
  }
  
  const result = await robloxAPI.setUserRole(userId, config.groupId, nextRole.id, ROBLOX_COOKIE);
  
  if (result && !result.error) {
    await sendRankChangeWebhook({
      type: 'promotion',
      targetUser: robloxNick,
      manager: permissionCheck.managerUsername,
      managerRank: permissionCheck.managerRank.name,
      oldRank: `${currentRank.name} (${currentRank.rank})`,
      newRank: `${nextRole.name} (${nextRole.rank})`,
      reason: reason
    });
    
    const embed = new EmbedBuilder()
      .setDescription(`İşlem başarıyla tamamlandı\n\n${robloxNick} (${userId}) kişisini, ${currentRank.name} rütbesinden ${nextRole.name} rütbesine başarıyla değiştirdin.\n\n**Sebep**\n${reason}`)
      .setColor(0x57F287);
    
    await interaction.editReply({ embeds: [embed] });
  } else {
    const errorMsg = translateRobloxError(result?.error?.errors?.[0]?.message || result?.error);
    await interaction.editReply({ embeds: [createErrorEmbed(`Terfi işlemi başarısız! ${errorMsg}`)] });
  }
}

async function checkBranchRankPermissions(discordUserId, branch, targetRank) {
  const managerUsername = getLinkedRobloxUsername(discordUserId);
  if (!managerUsername) {
    return { 
      allowed: false, 
      embed: createErrorEmbed('RoWifi ile hesabını doğrulamamışsın. `/yenile` komutunu kullanın.')
    };
  }

  const branchGroupId = config.branchGroups[branch];
  if (!branchGroupId || branchGroupId === 'GRUP_ID_BURAYA') {
    return { 
      allowed: false, 
      embed: createErrorEmbed(`${branch} grubu için ID tanımlanmamış!`)
    };
  }

  const managerId = await robloxAPI.getUserIdByUsername(managerUsername);
  if (!managerId) {
    return { allowed: false, embed: createErrorEmbed('Roblox kullanıcısı bulunamadı!') };
  }

  const managerBranchRank = await robloxAPI.getUserRankInGroup(managerId, branchGroupId);
  if (!managerBranchRank || managerBranchRank.rank === 0) {
    return { 
      allowed: false, 
      embed: createErrorEmbed(`Bu branşta (${branch}) yetkiniz yok veya üye değilsiniz!`)
    };
  }

  // Branş yönetici rütbe kontrolü (Örn: 10+ rütbe yönetebilir)
  const minBranchManageRank = config.minBranchManageRank || 10;
  if (managerBranchRank.rank < minBranchManageRank) {
    return { 
      allowed: false, 
      embed: createErrorEmbed(`${branch} branşında rütbe işlemi yapmak için yetkiniz yetersiz!`)
    };
  }

  if (targetRank !== undefined && targetRank >= managerBranchRank.rank) {
    return { 
      allowed: false, 
      embed: createErrorEmbed(`Branşta sizden üst veya aynı rütbede olan birine işlem yapamazsınız!`)
    };
  }

  return { 
    allowed: true, 
    managerRank: managerBranchRank,
    managerUsername: managerUsername,
    managerId: managerId,
    branchGroupId: branchGroupId
  };
}

async function handleBranchRankChange(interaction) {
  if (!interaction.guild.name.includes('AEK')) {
    return interaction.reply({ content: 'HATA: Bu komut sadece |AEK| sunucularında kullanılabilir.', flags: 64 });
  }
  await interaction.deferReply();
  if (!(await checkAccountSync(interaction))) return;

  const targetNick = interaction.options.getString('kişi');
  const branch = interaction.options.getString('branş');
  const rankName = interaction.options.getString('rütbe');
  const reason = interaction.options.getString('sebep');

  const targetUserId = await robloxAPI.getUserIdByUsername(targetNick);
  if (!targetUserId) return interaction.editReply({ embeds: [createErrorEmbed('Hedef kullanıcı bulunamadı!')] });

  const branchGroupId = config.branchGroups[branch];
  const targetCurrentRank = await robloxAPI.getUserRankInGroup(targetUserId, branchGroupId);
  
  const permCheck = await checkBranchRankPermissions(interaction.user.id, branch, targetCurrentRank?.rank);
  if (!permCheck.allowed) return interaction.editReply({ embeds: [permCheck.embed] });

  const roles = await robloxAPI.getGroupRoles(branchGroupId);
  const targetRole = roles.find(r => r.name.toLowerCase() === rankName.toLowerCase());
  if (!targetRole) return interaction.editReply({ embeds: [createErrorEmbed('Geçersiz branş rütbesi!')] });

  if (targetRole.rank >= permCheck.managerRank.rank) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kendi rütbenize eşit veya üst bir rütbe veremezsiniz!')] });
  }

  const result = await robloxAPI.setUserRole(targetUserId, branchGroupId, targetRole.id, ROBLOX_COOKIE);
  if (result && !result.error) {
    await sendRankChangeWebhook({
      type: 'branch_change',
      targetUser: targetNick,
      manager: permCheck.managerUsername,
      managerRank: permCheck.managerRank.name,
      newRank: `${targetRole.name} (${targetRole.rank})`,
      branch: branch,
      reason: reason
    });
    const embed = new EmbedBuilder()
      .setDescription(`**${branch}** branşında **${targetNick}** rütbesi **${targetRole.name}** olarak değiştirildi.\n\n**Sebep:** ${reason}`)
      .setColor(0x2B2D31);
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.editReply({ embeds: [createErrorEmbed(`Hata: ${translateRobloxError(result?.error?.errors?.[0]?.message)}`)] });
  }
}

async function handleBranchKick(interaction) {
  if (!interaction.guild.name.includes('AEK')) return interaction.reply({ content: 'HATA!', flags: 64 });
  await interaction.deferReply();
  const targetNick = interaction.options.getString('kişi');
  const reason = interaction.options.getString('sebep');
  // Branştan atma işlemi genellikle rütbeyi 0 (veya en alt) yapar veya gruptan atar. 
  // Burada gruptan atma API'si gerektiğini varsayıyoruz.
  await interaction.editReply({ content: 'Branştan atma sistemi geliştirme aşamasındadır.' });
}

async function handleBranchRequest(interaction) {
  await interaction.deferReply();
  const targetNick = interaction.options.getString('kişi');
  const branch = interaction.options.getString('branş');
  const decision = interaction.options.getString('karar');
  const reason = interaction.options.getString('sebep');

  const permCheck = await checkBranchRankPermissions(interaction.user.id, branch);
  if (!permCheck.allowed) return interaction.editReply({ embeds: [permCheck.embed] });

  await sendBranchRequestWebhook({
    targetUser: targetNick,
    manager: permCheck.managerUsername,
    managerRank: permCheck.managerRank.name,
    branch: branch,
    decision: decision,
    reason: reason
  });

  const embed = new EmbedBuilder()
    .setTitle('Branş İsteği Sonuçlandı')
    .setDescription(`**${targetNick}** kullanıcısının **${branch}** isteği **${decision}** edildi.\n\n**Sebep:** ${reason}`)
    .setColor(decision === 'kabul' ? 0x57F287 : 0xED4245);
  await interaction.editReply({ embeds: [embed] });
}

async function handleGroupList(interaction) {
  await interaction.deferReply();
  const targetNick = interaction.options.getString('kişi');
  const userId = await robloxAPI.getUserIdByUsername(targetNick);
  if (!userId) return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı bulunamadı!')] });

  // Sadece config'deki grupları kontrol et
  const groups = [config.groupId, ...Object.values(config.branchGroups)].filter(id => id && id !== 'GRUP_ID_BURAYA');
  const results = [];
  
  for (const gid of groups) {
    const rank = await robloxAPI.getUserRankInGroup(userId, gid);
    if (rank && rank.rank > 0) {
      results.push(`**ID ${gid}:** ${rank.name} (${rank.rank})`);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`${targetNick} - Grup Listesi`)
    .setDescription(results.length > 0 ? results.join('\n') : 'Hiçbir kayıtlı grupta bulunamadı.')
    .setColor(0x2B2D31);
  await interaction.editReply({ embeds: [embed] });
}

async function handleDemote(interaction) {
  if (!interaction.guild.name.includes('AEK')) {
    return interaction.reply({ content: 'HATA: Bu komut sadece |AEK| Turkish Armed Forces\'a bağlı sunucularda kullanılabilir.', ephemeral: true });
  }

  await interaction.deferReply();
  
  if (!(await checkAccountSync(interaction))) return;

  const targetNick = interaction.options.getString('kişi');
  const reason = interaction.options.getString('sebep');
  
  const targetUserId = await robloxAPI.getUserIdByUsername(targetNick);
  if (!targetUserId) return interaction.editReply({ embeds: [createErrorEmbed('Hedef kullanıcı bulunamadı!')] });

  const permissionCheck = await checkRankPermissions(interaction.user.id);
  if (!permissionCheck.allowed) return interaction.editReply({ embeds: [permissionCheck.embed] });

  const targetRank = await robloxAPI.getUserRankInGroup(targetUserId, config.groupId);
  if (targetRank && targetRank.rank >= permissionCheck.managerRank.rank && permissionCheck.managerRank.rank !== 255) {
    return interaction.editReply({ embeds: [createErrorEmbed('Sizden üst veya sizinle aynı rütbede olan birine işlem yapamazsınız!')] });
  }

  // Ana grupta rütbe 1'e çek
  const roles = await robloxAPI.getGroupRoles(config.groupId);
  const minRole = roles.sort((a,b) => a.rank - b.rank)[1]; // 0 misafir, 1 üye
  
  const result = await robloxAPI.setUserRole(targetUserId, config.groupId, minRole.id, ROBLOX_COOKIE);
  
  if (result && !result.error) {
    await sendRankChangeWebhook({
      type: 'demotion',
      targetUser: targetNick,
      manager: permissionCheck.managerUsername,
      managerRank: permissionCheck.managerRank.name,
      oldRank: targetRank ? `${targetRank.name} (${targetRank.rank})` : 'Bilinmiyor',
      newRank: `${minRole.name} (${minRole.rank})`,
      reason: reason
    });

    const embed = new EmbedBuilder()
      .setTitle('İşlem Başarılı')
      .setDescription(`**${targetNick}** kullanıcısı başarıyla demote edildi.`)
      .addFields(
        { name: 'Hedef Kullanıcı', value: targetNick, inline: true },
        { name: 'Eski Rütbe', value: targetRank ? targetRank.name : 'Bilinmiyor', inline: true },
        { name: 'Yeni Rütbe', value: minRole.name, inline: true },
        { name: 'Sebep', value: reason, inline: false }
      )
      .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${targetUserId}&width=420&height=420&format=png`)
      .setColor(0xED4245)
      .setFooter({ text: 'AEK Demote Sistemi', iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } else {
    const errorMsg = translateRobloxError(result?.error?.errors?.[0]?.message || result?.error);
    await interaction.editReply({ embeds: [createErrorEmbed(`Demote işlemi başarısız! ${errorMsg}`)] });
  }
}

async function handleGameBan(interaction) {
  await interaction.reply({ content: 'Oyun yasaklama API\'si entegrasyonu bekleniyor.', flags: 64 });
}

async function handleGameUnban(interaction) {
  await interaction.reply({ content: 'Oyun yasak kaldırma API\'si entegrasyonu bekleniyor.', flags: 64 });
}

async function handleAnnouncement(interaction) {
  const message = interaction.options.getString('mesaj');
  const channelName = interaction.options.getString('kanal_adi');
  const attachment = interaction.options.getAttachment('görsel');

  await interaction.deferReply({ flags: 64 });
  
  let count = 0;
  client.guilds.cache.forEach(guild => {
    const channel = guild.channels.cache.find(c => c.name.toLowerCase() === channelName.toLowerCase() && c.isTextBased());
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle('AEK - Duyuru')
        .setDescription(message)
        .setColor(0x2B2D31)
        .setTimestamp();
      if (attachment) embed.setImage(attachment.url);
      channel.send({ embeds: [embed] }).catch(() => {});
      count++;
    }
  });

  await interaction.editReply({ content: `Duyuru ${count} sunucuya gönderildi.` });
}

async function handleTicketSetup(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('AEK | Destek Sistemi')
    .setDescription('Yardıma mı ihtiyacın var? Aşağıdaki butona basarak menüyü açabilirsin.')
    .setColor(0x2B2D31);
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_ticket_menu').setLabel('Destek Talebi Aç').setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleTicketMenuButton(interaction) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category')
    .setPlaceholder('Bir kategori seçin')
    .addOptions([
      { label: 'Genel Destek', value: 'genel' },
      { label: 'Şikayet', value: 'sikayet' },
      { label: 'Branş Başvurusu', value: 'brans' },
      { label: 'Geri Dönüş&Transfer', value: 'transfer' }
    ]);

  await interaction.reply({ content: 'Lütfen talep kategorisini seçin:', components: [new ActionRowBuilder().addComponents(menu)], flags: 64 });
}

async function handleTicketCategorySelect(interaction) {
  const category = interaction.values[0];
  await interaction.reply({ content: `**${category}** kategorisinde ticket açılıyor...`, flags: 64 });
  // Kanal oluşturma vb. mantık buraya gelir
}

async function handleTicketClose(interaction) {
  await interaction.channel.delete().catch(() => {});
}

async function handleTicketClaim(interaction) {
  await interaction.reply({ content: `Ticket <@${interaction.user.id}> tarafından üstlenildi.` });
}

async function handleBranchActivityQuery(interaction) {
  await interaction.deferReply();
  // Mevcut team_activity.json okuma mantığı
  const embed = new EmbedBuilder().setTitle('Branş Aktifliği').setDescription('Aktiflik verileri yükleniyor...').setColor(0x2B2D31);
  await interaction.editReply({ embeds: [embed] });
}


async function handleBan(interaction) {
  // Config'deki admin rollerini kontrol et (Virgüllü format desteğiyle)
  const hasAdminRole = config.adminRoleIds.some(idStr => {
    const ids = idStr.split(',').map(s => s.trim());
    return ids.some(id => interaction.member.roles.cache.has(id));
  });

  if (!hasAdminRole) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komutu kullanma yetkiniz yok!')], ephemeral: true });
  }
  
  await interaction.deferReply();
  
  const discordUserId = interaction.options.getString('kişi');
  const reason = interaction.options.getString('sebep');
  
  try {
    const user = await client.users.fetch(discordUserId);
    const guilds = client.guilds.cache;
    
    const successGuilds = [];
    const failedGuilds = [];
    
    for (const [guildId, guild] of guilds) {
      try {
        await guild.members.ban(discordUserId, { reason: reason });
        successGuilds.push(guild.name);
      } catch (error) {
        failedGuilds.push(guild.name);
        console.error(`${guild.name} sunucusunda yasaklama hatası:`, error.message);
      }
    }
    
    const guildName = interaction.guild.name;
    const bannedUserTag = user.tag;
    let description = `İşlem başarıyla tamamlandı\n\n${bannedUserTag} Kişi başarıyla tüm ${guildName} sunucularından yasaklandı.\n\n**Sebep**\n${reason}\n\n`;
    
    if (successGuilds.length > 0) {
      description += `**Yasaklanan Sunucular**\n${successGuilds.map(name => `• | ${name}`).join('\n')}\n\n`;
    }
    
    if (failedGuilds.length > 0) {
      description += `**Yasaklanamayan Sunucular**\n${failedGuilds.map(name => `• | ${name}`).join('\n')}`;
    } else {
      description += `**Yasaklanamayan Sunucular**\nTüm sunucularda yasaklama başarılı.`;
    }
    
    const embed = new EmbedBuilder()
      .setDescription(description)
      .setColor(0x57F287);
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Yasaklama hatası:', error);
    await interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı yasaklanamadı! Kullanıcı ID\'sini kontrol edin.')] });
  }
}

async function handleUnban(interaction) {
  // Config'deki admin rollerini kontrol et (Virgüllü format desteğiyle)
  const hasAdminRole = config.adminRoleIds.some(idStr => {
    const ids = idStr.split(',').map(s => s.trim());
    return ids.some(id => interaction.member.roles.cache.has(id));
  });

  if (!hasAdminRole) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komutu kullanma yetkiniz yok!')], ephemeral: true });
  }
  
  await interaction.deferReply();
  
  const discordUserId = interaction.options.getString('kişi');
  const reason = interaction.options.getString('sebep');
  
  try {
    const guilds = client.guilds.cache;
    
    const successGuilds = [];
    const failedGuilds = [];
    
    for (const [guildId, guild] of guilds) {
      try {
        await guild.members.unban(discordUserId, `Tam yasak kaldırma: ${reason}`);
        successGuilds.push(guild.name);
      } catch (error) {
        failedGuilds.push(guild.name);
        console.error(`${guild.name} sunucusunda yasak kaldırma hatası:`, error.message);
      }
    }
    
    let description = `İşlem başarıyla tamamlandı\n\n<@${discordUserId}> Kişisinin AEK sunucularından yasaklamaları başarıyla kaldırıldı.\n\n**Sebep**\n${reason}\n\n`;
    
    if (successGuilds.length > 0) {
      description += `**Yasağın kaldırıldığı sunucular:**\n${successGuilds.map(name => `• | ${name}`).join('\n')}\n\n`;
    }
    
    if (failedGuilds.length > 0) {
      description += `**Yasağın kaldırılamadığı sunucular:**\n${failedGuilds.map(name => `• | ${name}`).join('\n')}`;
    } else {
      description += `**Yasağın kaldırılamadığı sunucular:**\nTüm sunucularda yasak kaldırıldı.`;
    }
    
    const embed = new EmbedBuilder()
      .setDescription(description)
      .setColor(0x57F287);
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Yasak kaldırma hatası:', error);
    await interaction.editReply({ embeds: [createErrorEmbed('Yasak kaldırılamadı! Kullanıcı ID\'sini kontrol edin.')] });
  }
}

async function handleActivityQuery(interaction) {
  await interaction.deferReply();
  
  const activity = await robloxAPI.getGameActivity(config.gameId);
  
  if (!activity) {
    return interaction.editReply({ embeds: [createErrorEmbed('Oyun bilgisi alınamadı!')] });
  }
  
  const embed = new EmbedBuilder()
    .setDescription(`**${activity.name}** oyununun mevcut aktifliği: **${activity.playing}** oyuncu`)
    .setColor(0x57F287);
  
  await interaction.editReply({ embeds: [embed] });
}

const TEAM_ACTIVITY_FILE = './data/team_activity.json';

// Express setup for team updates
// Use a common port or share the existing app if defined
const PORT_NUM = 5000;
if (typeof app === 'undefined') {
  const express = require('express');
  var app = express();
  const bodyParser = require('body-parser');
  app.use(bodyParser.json());
  app.listen(PORT_NUM, '0.0.0.0', () => {
    console.log(`API listening on port ${PORT_NUM}`);
  });
}

app.post('/update-teams', (req, res) => {
  const { teams, secret } = req.body;
  if (secret !== process.env.ROBLOX_API_KEY && secret !== 'AEK_SECRET_123') {
    return res.status(403).send('Unauthorized');
  }
  if (teams) {
    try {
      const data = { teams: teams, last_update: Date.now() };
      fs.writeFileSync(TEAM_ACTIVITY_FILE, JSON.stringify(data, null, 2));
      return res.status(200).send('Updated');
    } catch (e) {
      return res.status(500).send('Error');
    }
  }
  res.status(400).send('Invalid data');
});

async function handleBranchActivityQuery(interaction) {
  await interaction.deferReply();
  
  let teamData = { teams: {}, last_update: 0 };
  try {
    if (fs.existsSync(TEAM_ACTIVITY_FILE)) {
      teamData = JSON.parse(fs.readFileSync(TEAM_ACTIVITY_FILE, 'utf8'));
    }
  } catch (e) {}

  const activity = await robloxAPI.getGameActivity(config.gameId);
  
  if (!activity) {
    return interaction.editReply({ embeds: [createErrorEmbed('Oyun bilgisi alınamadı!')] });
  }

  const teams = [
    { name: 'Türk Silahlı Kuvvetleri', key: 'TSK' },
    { name: 'Ordu Generalleri', key: 'OG' },
    { name: 'Ordu Subayları', key: 'OS' },
    { name: 'Deniz Kuvvetleri Komutanlığı', key: 'DKK' },
    { name: 'Kara Kuvvetleri Komutanlığı', key: 'KKK' },
    { name: 'Hava Kuvvetleri Komutanlığı', key: 'HKK' },
    { name: 'Özel Kuvvetler Komutanlığı', key: 'OKK' },
    { name: 'Jandarma Genel Komutanlığı', key: 'JGK' },
    { name: 'Askeri İnzibat', key: 'ASIZ' }
  ];

  const embed = new EmbedBuilder()
    .setTitle('BRANŞ AKTİFLİK RAPORU')
    .setDescription(`**${activity.name.toUpperCase()}** sunucusundaki birimlerin anlık mevcudu aşağıda listelenmiştir.`)
    .setColor(0x2B2D31) // Modern koyu gri/siyah tema
    .setTimestamp();

  let teamListText = '';
  teams.forEach(team => {
    const count = teamData.teams[team.key] !== undefined ? teamData.teams[team.key] : '0';
    teamListText += `**${team.name}**\n└ Mevcut: \`${count}\` personel\n\n`;
  });

  embed.addFields(
    { name: 'BİRİMLER', value: teamListText || 'Veri bulunamadı.', inline: false },
    { name: 'TOPLAM SUNUCU MEVCUDU', value: `\`${activity.playing}\` / \`${activity.maxPlayers}\``, inline: false }
  );

  const lastUpdate = teamData.last_update > 0 ? `<t:${Math.floor(teamData.last_update / 1000)}:R>` : 'Veri senkronize edilmedi';
  embed.setFooter({ text: `Sistem Durumu: Çevrimiçi | Son Güncelleme: ${teamData.last_update > 0 ? new Date(teamData.last_update).toLocaleTimeString('tr-TR') : 'Yok'}` });
  
  await interaction.editReply({ embeds: [embed] });
}

// PORT handling moved up to PORT_NUM section
// End of file cleanup
client.login(DISCORD_TOKEN);
