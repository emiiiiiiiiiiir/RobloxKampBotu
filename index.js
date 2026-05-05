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
  StringSelectMenuBuilder,
  ActivityType
} = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const fs = require('fs');
const axios = require('axios');
const robloxAPI = require('./src/roblox');

function loadConfig() {
  const raw = fs.readFileSync('./config.json', 'utf8');
  const fixed = raw.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(fixed);
}
const config = loadConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

const ACCOUNT_LINKS_FILE = './account_links.json';
const PENDING_VERIFICATIONS_FILE = './pending_verifications.json';
const ACTIVE_TICKETS_FILE = './active_tickets.json';

// Sunucu adına göre doğru grup config'ini döndürür
function getGuildConfig(guild) {
  const name = guild ? guild.name : '';
  if (name.includes('ATF')) {
    return {
      groupId: config.atf.groupId,
      gameId: config.atf.gameId,
      adminRoleIds: config.atf.adminRoleIds || config.adminRoleIds,
      branchGroups: config.atf.branchGroups || {},
      rankYetkiliRutbeler: config.atf.rankYetkiliRutbeler || config.rankYetkiliRutbeler || [255]
    };
  }
  return {
    groupId: config.groupId,
    gameId: config.gameId,
    adminRoleIds: config.adminRoleIds,
    branchGroups: config.branchGroups || {},
    rankYetkiliRutbeler: config.rankYetkiliRutbeler || [255]
  };
}

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
    const title = data.type === 'promotion' ? 'Terfi Yapıldı' :
                  data.type === 'demotion'  ? 'Tenzil Yapıldı' :
                  data.type === 'branch_change' ? 'Branş Rütbe Değişikliği Yapıldı' :
                  'Rütbe Değişikliği Yapıldı';

    const color = data.type === 'promotion' ? 0x57F287 :
                  data.type === 'demotion'  ? 0xED4245 :
                  0x5865F2;

    const branchPart = data.branch ? ` (${data.branch} branşında)` : '';
    const rankPart = data.oldRank
      ? `**${data.oldRank}** → **${data.newRank}**`
      : `**${data.newRank}**`;

    let description = `**${data.manager}**, **${data.targetUser}** kişisinin rütbesini${branchPart} ${rankPart} olarak değiştirmiştir.`;

    if (data.reason) {
      description += `\n\n**Sebep:** ${data.reason}`;
    }

    const embed = {
      title,
      description,
      color,
      timestamp: new Date().toISOString(),
      footer: { text: 'Imperial Forces / emir_1881' }
    };

    await axios.post(config.webhookUrl, { embeds: [embed] });
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
    const kabulMu = data.decision === 'kabul';
    const title = kabulMu ? 'Branş İsteği Kabul Edildi' : 'Branş İsteği Reddedildi';
    const color = kabulMu ? 0x57F287 : 0xED4245;

    let description = `**${data.manager}**, **${data.targetUser}** kişisinin **${data.branch}** branş isteğini ${kabulMu ? 'kabul etmiştir' : 'reddetmiştir'}.`;

    if (data.reason) {
      description += `\n\n**Sebep:** ${data.reason}`;
    }

    const embed = {
      title,
      description,
      color,
      timestamp: new Date().toISOString(),
      footer: { text: 'Imperial Forces / emir_1881' }
    };

    await axios.post(webhookUrl, { embeds: [embed] });
  } catch (error) {
    console.error('Webhook gönderim hatası:', error.message);
  }
}

async function isUserInMainGroup(discordUserId) {
  const robloxUsername = getLinkedRobloxUsername(discordUserId);
  if (!robloxUsername) return true;

  try {
    const userId = await robloxAPI.getUserIdByUsername(robloxUsername);
    if (!userId) return true;

    const groups = await robloxAPI.getUserGroups(userId);
    if (!groups) return true;

    return groups.some(g => String(g.groupId) === String(config.groupId) || String(g.groupId) === String(config.atf?.groupId));
  } catch (err) {
    console.error('Ana grup kontrolü hatası:', err.message);
    return true;
  }
}

async function isUserBlacklisted(discordUserId) {
  if (!config.blacklistGroupIds || config.blacklistGroupIds.length === 0) {
    return { blacklisted: false };
  }

  const robloxUsername = getLinkedRobloxUsername(discordUserId);
  if (!robloxUsername) {
    return { blacklisted: false };
  }

  try {
    const userId = await robloxAPI.getUserIdByUsername(robloxUsername);
    if (!userId) return { blacklisted: false };

    const groups = await robloxAPI.getUserGroups(userId);
    if (!groups) return { blacklisted: false };

    for (const groupId of config.blacklistGroupIds) {
      const found = groups.find(g => String(g.groupId) === String(groupId));
      if (found) {
        return { blacklisted: true, groupName: found.groupName, robloxUsername };
      }
    }
  } catch (err) {
    console.error('Kara liste kontrolü hatası:', err.message);
  }

  return { blacklisted: false };
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
    .setName('grup-listele')
    .setDescription('Roblox kullanıcısının üye olduğu tüm grupları listeler')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Roblox kullanıcı adı')
        .setRequired(true)
    ),

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
    .setName('tamyasak-sorgu')
    .setDescription('Kullanıcının tam yasak durumunu ve yasaklı olduğu sunucuları sorgular')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Discord kullanıcı ID\'si')
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
    .setName('ittifak-aktiflik')
    .setDescription('TKT ve ATF oyunlarının aktifliğini birlikte gösterir'),

  new SlashCommandBuilder()
    .setName('ittifak-branş-aktiflik')
    .setDescription('TKT ve ATF branşlarının aktifliğini ayrı ayrı gösterir (Sadece İttifak Yetkilileri)'),
  
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
    .setName('oyun-yasak-sorgu')
    .setDescription('Roblox kullanıcısının oyun yasak bilgilerini gösterir')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Sorgulanacak kişinin Roblox kullanıcı adı')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('gamepass-sorgu')
    .setDescription('Kişinin oyundaki hangi gamepasslere sahip olduğunu listeler')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Roblox kullanıcı adı')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('duyuru')
    .setDescription('Botun bulunduğu tüm sunuculara duyuru yapar')
    .addStringOption(option =>
      option.setName('kanal_adi')
        .setDescription('Duyurunun gönderileceği kanal adı (örn: duyurular, genel)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('mesaj')
        .setDescription('Duyuru mesajı (opsiyonel)')
        .setRequired(false)
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
    .setDescription('Kullanıcıyı bulunduğu branş gruplarından atar ve ana grupta en alt rütbeye çeker')
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
    .setDefaultMemberPermissions(0),

  new SlashCommandBuilder()
    .setName('branş-istek')
    .setDescription('Branş başvurusunu sonuçlandırır')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Kullanıcı adı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('branş')
        .setDescription('Branş adı')
        .setRequired(true)
        .addChoices(
          ...Object.keys(config.branchGroups || {}).map(name => ({ name, value: name }))
        )
    )
    .addStringOption(option =>
      option.setName('karar')
        .setDescription('Kabul veya Red')
        .setRequired(true)
        .addChoices(
          { name: 'Kabul', value: 'kabul' },
          { name: 'Red', value: 'red' }
        )
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Sonuç sebebi')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('branş-istek-sorgu')
    .setDescription('Kişinin hangi branş gruplarına istek attığını listeler')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Roblox kullanıcı adı')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('branş-rütbe-sorgu')
    .setDescription('Kişinin hangi branşlarda hangi rütbede olduğunu listeler')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Roblox kullanıcı adı')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('branş-rütbe-değiştir')
    .setDescription('Branş grubunda rütbe değiştirir')
    .addStringOption(option =>
      option.setName('kişi')
        .setDescription('Kullanıcı adı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('branş')
        .setDescription('Branş adı')
        .setRequired(true)
        .addChoices(
          ...Object.keys(config.branchGroups || {}).map(name => ({ name, value: name }))
        )
    )
    .addStringOption(option =>
      option.setName('rütbe')
        .setDescription('Yeni rütbe')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Değişim sebebi')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Botun gecikme süresini gösterir'),

  new SlashCommandBuilder()
    .setName('ban-affı')
    .setDescription('Sunucuda yasaklı olan herkesin yasağını kaldırır')
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Af sebebi')
        .setRequired(false)
    ),
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

  const setStatus = () => {
    client.user.setPresence({
      activities: [{ name: 'Imperial Forces Sunucularını İzliyor', type: ActivityType.Custom }],
      status: 'dnd'
    });
  };

  setTimeout(setStatus, 3000);
  setInterval(setStatus, 30 * 60 * 1000);
  
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
      const blacklistCheck = await isUserBlacklisted(interaction.user.id);
      if (blacklistCheck.blacklisted) {
        const campShortName = blacklistCheck.groupName.split(' ')[0];
        await interaction.reply({ content: `**${campShortName}** Kampında bulunduğunuz için komutları kullanamıyorsunuz.` });
        return;
      }

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
        case 'tamyasak-sorgu':
          await handleBanQuery(interaction);
          break;
        case 'aktiflik-sorgu':
          await handleActivityQuery(interaction);
          break;
        case 'ittifak-aktiflik':
          await handleIttifakActivity(interaction);
          break;
        case 'ittifak-branş-aktiflik':
          await handleIttifakBransAktiflik(interaction);
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
        case 'branş-istek-sorgu':
          await handleBranchRequestQuery(interaction);
          break;
        case 'branş-rütbe-sorgu':
          await handleBranchRankQuery(interaction);
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
        case 'oyun-yasak-sorgu':
          await handleGameBanQuery(interaction);
          break;
        case 'gamepass-sorgu':
          await handleGamePassQuery(interaction);
          break;
        case 'duyuru':
          await handleAnnouncement(interaction);
          break;
        case 'ticket-setup':
          await handleTicketSetup(interaction);
          break;
        case 'ping':
          await handlePing(interaction);
          break;
        case 'ban-affı':
          await handleBanAmnesty(interaction);
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
        const acGuildCfg = getGuildConfig(interaction.guild);
        let groupId = acGuildCfg.groupId;
        
        if (commandName === 'branş-rütbe-değiştir') {
          const branch = interaction.options.getString('branş');
          if (branch && acGuildCfg.branchGroups[branch]) {
            groupId = acGuildCfg.branchGroups[branch];
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

async function checkRankPermissions(discordUserId, targetRank, guild) {
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

  const guildCfg = getGuildConfig(guild);
  const managerRank = await robloxAPI.getUserRankInGroup(managerId, guildCfg.groupId);
  if (!managerRank) {
    return { 
      allowed: false, 
      embed: createErrorEmbed('Grupta olmayan kişiler rütbe işlemi yapamaz!')
    };
  }

  // Yetkili rütbe seviyeleri config'den okunur
  const allowedRankValues = guildCfg.rankYetkiliRutbeler;
  if (!allowedRankValues.includes(managerRank.rank)) {
    return { 
      allowed: false, 
      embed: createErrorEmbed(`Bu işlemi yapmak için yetkiniz yetersiz! (Rütbeniz: ${managerRank.name} | Numara: ${managerRank.rank})`)
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
  const guildName = interaction.guild.name;
  if (!guildName.includes('TKT') && !guildName.includes('ATF')) {
    return interaction.reply({ content: 'HATA: Bu komut sadece TKT veya ATF sunucularında kullanılabilir.', ephemeral: true });
  }
  
  await interaction.deferReply();
  
  if (!(await checkAccountSync(interaction))) return;

  const robloxNick = interaction.options.getString('kişi');
  const userId = await robloxAPI.getUserIdByUsername(robloxNick);
  
  if (!userId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı bulunamadı!')] });
  }
  
  const userInfo = await robloxAPI.getUserInfo(userId);
  const { groupId } = getGuildConfig(interaction.guild);
  const rankInfo = await robloxAPI.getUserRankInGroup(userId, groupId);
  
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
  const guildName = interaction.guild.name;
  if (!guildName.includes('TKT') && !guildName.includes('ATF')) {
    return interaction.reply({ content: 'HATA: Bu komut sadece TKT veya ATF sunucularında kullanılabilir.', ephemeral: true });
  }
  
  await interaction.deferReply();
  
  if (!(await checkAccountSync(interaction))) return;

  const robloxNick = interaction.options.getString('kişi');
  const targetRankName = interaction.options.getString('rütbe');
  const reason = interaction.options.getString('sebep');
  const { groupId } = getGuildConfig(interaction.guild);
  
  const targetUserId = await robloxAPI.getUserIdByUsername(robloxNick);
  if (!targetUserId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Hedef kullanıcı bulunamadı!')] });
  }

  const roles = await robloxAPI.getGroupRoles(groupId);
  if (!roles) {
    return interaction.editReply({ embeds: [createErrorEmbed('Grup rütbeleri alınamadı!')] });
  }
  
  const targetRole = roles.find(r => r.name.toLowerCase() === targetRankName.toLowerCase());
  if (!targetRole) {
    return interaction.editReply({ embeds: [createErrorEmbed('Geçersiz rütbe adı!')] });
  }

  const permissionCheck = await checkRankPermissions(interaction.user.id, targetRole.rank, interaction.guild);
  if (!permissionCheck.allowed) {
    return interaction.editReply({ embeds: [permissionCheck.embed] });
  }

  // Hedef kişinin rütbesini kontrol et
  const targetRank = await robloxAPI.getUserRankInGroup(targetUserId, groupId);
  if (targetRank && targetRank.rank >= permissionCheck.managerRank.rank && permissionCheck.managerRank.rank !== 255) {
    return interaction.editReply({ embeds: [createErrorEmbed('Sizden üst veya sizinle aynı rütbede olan birine işlem yapamazsınız!')] });
  }
  
  if (targetUserId === permissionCheck.managerId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kendi rütbeni değiştiremezsin!')] });
  }

  const result = await robloxAPI.setUserRole(targetUserId, groupId, targetRole.id, ROBLOX_COOKIE);
  
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
  const guildName = interaction.guild.name;
  if (!guildName.includes('TKT') && !guildName.includes('ATF')) {
    return interaction.reply({ content: 'HATA: Bu komut sadece TKT veya ATF sunucularında kullanılabilir.', ephemeral: true });
  }
  
  await interaction.deferReply();
  
  if (!(await checkAccountSync(interaction))) return;

  const robloxNick = interaction.options.getString('kişi');
  const reason = interaction.options.getString('sebep');
  const { groupId } = getGuildConfig(interaction.guild);
  const userId = await robloxAPI.getUserIdByUsername(robloxNick);
  
  if (!userId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Hedef kullanıcı bulunamadı!')] });
  }
  
  const currentRank = await robloxAPI.getUserRankInGroup(userId, groupId);
  if (!currentRank) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı grupta değil!')] });
  }
  
  const roles = await robloxAPI.getGroupRoles(groupId);
  if (!roles) {
    return interaction.editReply({ embeds: [createErrorEmbed('Grup rütbeleri alınamadı! Grup ID\'sini kontrol edin.')] });
  }
  
  const sortedRoles = roles.sort((a, b) => a.rank - b.rank);
  const currentIndex = sortedRoles.findIndex(r => r.rank === currentRank.rank);
  
  if (currentIndex === sortedRoles.length - 1) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı zaten en üst rütbede!')] });
  }
  
  const nextRole = sortedRoles[currentIndex + 1];
  
  const permissionCheck = await checkRankPermissions(interaction.user.id, nextRole.rank, interaction.guild);
  if (!permissionCheck.allowed) {
    return interaction.editReply({ embeds: [permissionCheck.embed] });
  }
  
  // Kendi rütbesini değiştirmeyi engelle
  if (userId === permissionCheck.managerId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kendi rütbenizi değiştiremezsiniz!')] });
  }
  
  const result = await robloxAPI.setUserRole(userId, groupId, nextRole.id, ROBLOX_COOKIE);
  
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

async function handleRankDemotion(interaction) {
  const guildName = interaction.guild.name;
  if (!guildName.includes('TKT') && !guildName.includes('ATF')) {
    return interaction.reply({ content: 'HATA: Bu komut sadece TKT veya ATF sunucularında kullanılabilir.', ephemeral: true });
  }

  await interaction.deferReply();

  if (!(await checkAccountSync(interaction))) return;

  const robloxNick = interaction.options.getString('kişi');
  const reason = interaction.options.getString('sebep');
  const { groupId } = getGuildConfig(interaction.guild);
  const userId = await robloxAPI.getUserIdByUsername(robloxNick);

  if (!userId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Hedef kullanıcı bulunamadı!')] });
  }

  const currentRank = await robloxAPI.getUserRankInGroup(userId, groupId);
  if (!currentRank) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı grupta değil!')] });
  }

  const roles = await robloxAPI.getGroupRoles(groupId);
  if (!roles) {
    return interaction.editReply({ embeds: [createErrorEmbed('Grup rütbeleri alınamadı! Grup ID\'sini kontrol edin.')] });
  }

  const sortedRoles = roles.sort((a, b) => a.rank - b.rank);
  const currentIndex = sortedRoles.findIndex(r => r.rank === currentRank.rank);

  if (currentIndex <= 0) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı zaten en alt rütbede!')] });
  }

  const prevRole = sortedRoles[currentIndex - 1];

  const permissionCheck = await checkRankPermissions(interaction.user.id, currentRank.rank, interaction.guild);
  if (!permissionCheck.allowed) {
    return interaction.editReply({ embeds: [permissionCheck.embed] });
  }

  if (userId === permissionCheck.managerId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kendi rütbenizi değiştiremezsiniz!')] });
  }

  const result = await robloxAPI.setUserRole(userId, groupId, prevRole.id, ROBLOX_COOKIE);

  if (result && !result.error) {
    await sendRankChangeWebhook({
      type: 'demotion',
      targetUser: robloxNick,
      manager: permissionCheck.managerUsername,
      managerRank: permissionCheck.managerRank.name,
      oldRank: `${currentRank.name} (${currentRank.rank})`,
      newRank: `${prevRole.name} (${prevRole.rank})`,
      reason: reason
    });

    const embed = new EmbedBuilder()
      .setDescription(`İşlem başarıyla tamamlandı\n\n${robloxNick} (${userId}) kişisini, ${currentRank.name} rütbesinden ${prevRole.name} rütbesine başarıyla tenzil ettin.\n\n**Sebep**\n${reason}`)
      .setColor(0xED4245);

    await interaction.editReply({ embeds: [embed] });
  } else {
    const errorMsg = translateRobloxError(result?.error?.errors?.[0]?.message || result?.error);
    await interaction.editReply({ embeds: [createErrorEmbed(`Tenzil işlemi başarısız! ${errorMsg}`)] });
  }
}

async function checkBranchRankPermissions(discordUserId, branch, targetRank, guild) {
  const managerUsername = getLinkedRobloxUsername(discordUserId);
  if (!managerUsername) {
    return { 
      allowed: false, 
      embed: createErrorEmbed('RoWifi ile hesabını doğrulamamışsın. `/yenile` komutunu kullanın.')
    };
  }

  const { branchGroups } = getGuildConfig(guild);
  const branchGroupId = branchGroups[branch];
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

  // Branş yönetici rütbe kontrolü — her branş için ayrı ayrı ayarlanabilir
  const branchManagerRanks = config.branchManagerRanks || {};
  const minBranchManageRank =
    (typeof branchManagerRanks === 'object' && !Array.isArray(branchManagerRanks))
      ? (branchManagerRanks[branch] ?? config.minBranchManageRank ?? 10)
      : (config.minBranchManageRank ?? 10);
  if (managerBranchRank.rank < minBranchManageRank) {
    return { 
      allowed: false, 
      embed: createErrorEmbed(`${branch} branşında rütbe işlemi yapmak için yetkiniz yetersiz! (Gereken: ${minBranchManageRank}+)`)
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
  const guildName = interaction.guild.name;
  if (!guildName.includes('TKT') && !guildName.includes('ATF')) {
    return interaction.reply({ content: 'HATA: Bu komut sadece TKT veya ATF sunucularında kullanılabilir.', flags: 64 });
  }
  await interaction.deferReply();
  if (!(await checkAccountSync(interaction))) return;

  const targetNick = interaction.options.getString('kişi');
  const branch = interaction.options.getString('branş');
  const rankName = interaction.options.getString('rütbe');
  const reason = interaction.options.getString('sebep');

  const targetUserId = await robloxAPI.getUserIdByUsername(targetNick);
  if (!targetUserId) return interaction.editReply({ embeds: [createErrorEmbed('Hedef kullanıcı bulunamadı!')] });

  const { branchGroups } = getGuildConfig(interaction.guild);
  const branchGroupId = branchGroups[branch];
  const targetCurrentRank = await robloxAPI.getUserRankInGroup(targetUserId, branchGroupId);
  
  const permCheck = await checkBranchRankPermissions(interaction.user.id, branch, targetCurrentRank?.rank, interaction.guild);
  if (!permCheck.allowed) return interaction.editReply({ embeds: [permCheck.embed] });

  const roles = await robloxAPI.getGroupRoles(branchGroupId);
  const targetRole = roles.find(r => r.name.toLowerCase() === rankName.toLowerCase());
  if (!targetRole) return interaction.editReply({ embeds: [createErrorEmbed('Geçersiz branş rütbesi!')] });

  if (targetUserId === permCheck.managerId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kendi branş rütbenizi değiştiremezsiniz!')] });
  }

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
  const guildName = interaction.guild.name;
  if (!guildName.includes('TKT') && !guildName.includes('ATF')) return interaction.reply({ content: 'HATA: Bu komut sadece TKT veya ATF sunucularında kullanılabilir.', flags: 64 });
  await interaction.deferReply();
  
  const targetNick = interaction.options.getString('kişi');
  const reason = interaction.options.getString('sebep');
  
  const targetUserId = await robloxAPI.getUserIdByUsername(targetNick);
  if (!targetUserId) return interaction.editReply({ embeds: [createErrorEmbed('Hedef kullanıcı bulunamadı!')] });

  const { branchGroups } = getGuildConfig(interaction.guild);
  const removedBranches = [];
  if (branchGroups) {
    for (const branchName in branchGroups) {
      const branchId = branchGroups[branchName];
      if (branchId && branchId !== 'GRUP_ID_BURAYA') {
        try {
          const currentBranchRank = await robloxAPI.getUserRankInGroup(targetUserId, branchId);
          if (currentBranchRank && currentBranchRank.rank > 0) {
            const permCheck = await checkBranchRankPermissions(interaction.user.id, branchName, undefined, interaction.guild);
            if (permCheck.allowed) {
              await robloxAPI.banUserFromGroup(targetUserId, branchId, ROBLOX_COOKIE);
              removedBranches.push(branchName);
              
              await sendRankChangeWebhook({
                type: 'branch_kick',
                targetUser: targetNick,
                manager: permCheck.managerUsername,
                managerRank: permCheck.managerRank.name,
                branch: branchName,
                reason: reason
              });
            }
          }
        } catch (e) {
          console.error(`${branchName} grubundan atma hatası:`, e.message);
        }
      }
    }
  }

  if (removedBranches.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle('İşlem Başarılı')
      .setDescription(`**${targetNick}** kullanıcısı branşlardan atıldı.`)
      .addFields(
        { name: 'Atılan Branşlar', value: removedBranches.join(', '), inline: false },
        { name: 'Sebep', value: reason, inline: false }
      )
      .setColor(0xED4245)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı herhangi bir branş grubunda bulunamadı veya yetkiniz yetersiz.')] });
  }
}

async function handleBranchRequestQuery(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!(await checkAccountSync(interaction))) return;

  const robloxNick = interaction.options.getString('kişi');
  const userId = await robloxAPI.getUserIdByUsername(robloxNick);

  if (!userId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı bulunamadı!')] });
  }

  const { branchGroups } = getGuildConfig(interaction.guild);
  const pendingBranches = [];

  for (const [branchName, groupId] of Object.entries(branchGroups)) {
    if (!groupId || groupId === 'GRUP_ID_BURAYA') continue;

    // Kullanıcının bu branşta yetkisi var mı kontrol et
    const permCheck = await checkBranchRankPermissions(interaction.user.id, branchName, undefined, interaction.guild);
    if (!permCheck.allowed) continue;

    try {
      const requests = await robloxAPI.getJoinRequests(groupId, ROBLOX_COOKIE);
      if (requests && requests.some(r => r.requester?.userId === userId)) {
        pendingBranches.push(branchName);
      }
    } catch (e) {
      console.error(`${branchName} istek sorgu hatası:`, e.message);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('Branş İstek Sorgu')
    .setDescription(`**${robloxNick}** adlı kullanıcının bekleyen branş istekleri:`)
    .addFields({
      name: 'Bekleyen İstekler',
      value: pendingBranches.length > 0 ? pendingBranches.map(b => `• ${b}`).join('\n') : 'Hiçbir branşa istek atılmamış.',
      inline: false
    })
    .setColor(pendingBranches.length > 0 ? 0x5865F2 : 0xED4245)
    .setFooter({ text: `Roblox ID: ${userId}` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleBranchRankQuery(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!(await checkAccountSync(interaction))) return;

  const robloxNick = interaction.options.getString('kişi');
  const userId = await robloxAPI.getUserIdByUsername(robloxNick);

  if (!userId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı bulunamadı!')] });
  }

  const { branchGroups } = getGuildConfig(interaction.guild);
  const branchRanks = [];

  for (const [branchName, groupId] of Object.entries(branchGroups)) {
    if (!groupId || groupId === 'GRUP_ID_BURAYA') continue;

    const permCheck = await checkBranchRankPermissions(interaction.user.id, branchName, undefined, interaction.guild);
    if (!permCheck.allowed) continue;

    try {
      const rank = await robloxAPI.getUserRankInGroup(userId, groupId);
      if (rank) {
        branchRanks.push({ branch: branchName, rank: rank.name });
      }
    } catch (e) {
      console.error(`${branchName} rütbe sorgu hatası:`, e.message);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('Branş Rütbe Sorgu')
    .setDescription(`**${robloxNick}** adlı kullanıcının branşlardaki rütbeleri:`)
    .addFields({
      name: 'Branşlar',
      value: branchRanks.length > 0 ? branchRanks.map(b => `• **${b.branch}** — ${b.rank}`).join('\n') : 'Hiçbir branşta üye değil.',
      inline: false
    })
    .setColor(branchRanks.length > 0 ? 0x57F287 : 0xED4245)
    .setFooter({ text: `Roblox ID: ${userId}` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleBranchRequest(interaction) {
  await interaction.deferReply();
  const targetNick = interaction.options.getString('kişi');
  const branch = interaction.options.getString('branş');
  const decision = interaction.options.getString('karar');
  const reason = interaction.options.getString('sebep');

  const permCheck = await checkBranchRankPermissions(interaction.user.id, branch, undefined, interaction.guild);
  if (!permCheck.allowed) return interaction.editReply({ embeds: [permCheck.embed] });

  const { branchGroups: bGroups3 } = getGuildConfig(interaction.guild);
  const branchGroupId = bGroups3[branch];
  
  if (decision === 'kabul') {
    // Önce kullanıcının ID'sini al
    const targetUserId = await robloxAPI.getUserIdByUsername(targetNick);
    if (!targetUserId) {
      return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı bulunamadı!')] });
    }

    // Katılma isteği olup olmadığını kontrol et
    const joinRequests = await robloxAPI.getJoinRequests(branchGroupId, ROBLOX_COOKIE);
    if (!joinRequests) {
      return interaction.editReply({ embeds: [createErrorEmbed('Katılma istekleri kontrol edilemedi! Çerez geçersiz olabilir.')] });
    }

    const request = joinRequests.find(r => r.requester.userId === targetUserId);
    if (!request) {
      return interaction.editReply({ embeds: [createErrorEmbed(`**${targetNick}** kullanıcısının **${branch}** grubunda bekleyen bir katılma isteği bulunamadı!`)] });
    }

    // İsteği kabul et
    const acceptSuccess = await robloxAPI.acceptJoinRequest(branchGroupId, targetUserId, ROBLOX_COOKIE);
    if (!acceptSuccess) {
      return interaction.editReply({ embeds: [createErrorEmbed('İstek kabul edilirken bir hata oluştu!')] });
    }
  }

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

  const groups = await robloxAPI.getUserGroups(userId);
  if (!groups) return interaction.editReply({ embeds: [createErrorEmbed('Grup bilgileri alınamadı!')] });
  if (groups.length === 0) return interaction.editReply({ embeds: [createErrorEmbed('Bu kullanıcı hiçbir gruba üye değil.')] });

  const lines = groups.map((g, i) => `**${i + 1}. ${g.groupName}**\n${g.roleName}`);

  // Discord embed 4096 karakter sınırı — çok fazla grup varsa böl
  const chunks = [];
  let current = '';
  for (const line of lines) {
    if ((current + '\n\n' + line).length > 4000) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n\n' + line : line;
    }
  }
  if (current) chunks.push(current);

  const embeds = chunks.map((chunk, i) => {
    const embed = new EmbedBuilder()
      .setDescription(chunk)
      .setColor(0x2B2D31);
    if (i === 0) embed.setTitle(`${targetNick} — Grup Listesi (${groups.length} grup)`);
    return embed;
  });

  await interaction.editReply({ embeds: embeds.slice(0, 10) });
}

async function handleDemote(interaction) {
  const guildName = interaction.guild.name;
  if (!guildName.includes('TKT') && !guildName.includes('ATF')) {
    return interaction.reply({ content: 'HATA: Bu komut sadece TKT veya ATF sunucularında kullanılabilir.', ephemeral: true });
  }

  await interaction.deferReply();

  if (!(await checkAccountSync(interaction))) return;

  const targetNick = interaction.options.getString('kişi');
  const reason = interaction.options.getString('sebep');
  const { groupId, branchGroups } = getGuildConfig(interaction.guild);

  const targetUserId = await robloxAPI.getUserIdByUsername(targetNick);
  if (!targetUserId) return interaction.editReply({ embeds: [createErrorEmbed('Hedef kullanıcı bulunamadı!')] });

  const permissionCheck = await checkRankPermissions(interaction.user.id, undefined, interaction.guild);
  if (!permissionCheck.allowed) return interaction.editReply({ embeds: [permissionCheck.embed] });

  const targetRank = await robloxAPI.getUserRankInGroup(targetUserId, groupId);
  const roles = await robloxAPI.getGroupRoles(groupId);
  const sortedRoles = roles.sort((a, b) => a.rank - b.rank);

  // OR-1/A isminde rol ara, bulamazsan rank > 0 olan ilk rolü kullan
  const targetRole =
    sortedRoles.find(r => r.name === 'OR-1/A') ||
    sortedRoles.find(r => r.rank > 0);

  if (!targetRole) {
    return interaction.editReply({ embeds: [createErrorEmbed('OR-1/A rütbesi bulunamadı!')] });
  }

  // Ana grup rütbe değişikliği
  let mainGroupSuccess = true;
  let mainGroupError = null;
  if (targetRank && targetRank.id !== targetRole.id) {
    const result = await robloxAPI.setUserRole(targetUserId, groupId, targetRole.id, ROBLOX_COOKIE);
    if (result && result.error) {
      mainGroupSuccess = false;
      mainGroupError = translateRobloxError(result.error?.errors?.[0]?.message || result.error);
    }
  }

  // Branşlardan at (ana grup başarısız olsa bile çalışır)
  const removedBranches = [];
  if (branchGroups) {
    for (const branchName in branchGroups) {
      const branchId = branchGroups[branchName];
      if (branchId && branchId !== 'GRUP_ID_BURAYA') {
        try {
          const currentBranchRank = await robloxAPI.getUserRankInGroup(targetUserId, branchId);
          if (currentBranchRank && currentBranchRank.rank > 0) {
            await robloxAPI.banUserFromGroup(targetUserId, branchId, ROBLOX_COOKIE);
            removedBranches.push(branchName);
          }
        } catch (e) {
          console.error(`${branchName} grubundan atma hatası:`, e.message);
        }
      }
    }
  }

  await sendRankChangeWebhook({
    type: 'demotion',
    targetUser: targetNick,
    manager: permissionCheck.managerUsername,
    managerRank: permissionCheck.managerRank.name,
    oldRank: targetRank ? `${targetRank.name} (${targetRank.rank})` : 'Bilinmiyor',
    newRank: mainGroupSuccess ? `${targetRole.name} (${targetRole.rank})` : 'Değiştirilemedi',
    reason: reason
  });

  const embed = new EmbedBuilder()
    .setTitle('Demote İşlemi Tamamlandı')
    .addFields(
      { name: 'Hedef Kullanıcı', value: targetNick, inline: true },
      { name: 'Eski Rütbe', value: targetRank ? targetRank.name : 'Bilinmiyor', inline: true },
      { name: 'Ana Grup Rütbe', value: mainGroupSuccess ? `✅ ${targetRole.name}` : `❌ Hata: ${mainGroupError}`, inline: false },
      { name: 'Atılan Branşlar', value: removedBranches.length > 0 ? `✅ ${removedBranches.join(', ')}` : 'Hiçbir branşta bulunamadı.', inline: false },
      { name: 'Sebep', value: reason, inline: false }
    )
    .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${targetUserId}&width=420&height=420&format=png`)
    .setColor(0xED4245)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

const GAME_BANS_FILE = './data/game_bans.json';

function loadGameBans() {
  try {
    if (fs.existsSync(GAME_BANS_FILE)) {
      const data = fs.readFileSync(GAME_BANS_FILE, 'utf8');
      if (data && data.trim() !== '') return JSON.parse(data);
    }
  } catch (e) {}
  return {};
}

function saveGameBans(bans) {
  try {
    fs.writeFileSync(GAME_BANS_FILE, JSON.stringify(bans, null, 2), 'utf8');
  } catch (e) {
    console.error('Oyun ban kaydı hatası:', e.message);
  }
}

async function handleGameBan(interaction) {
  const hasAdminRole = getGuildConfig(interaction.guild).adminRoleIds.some(idStr => {
    const ids = idStr.split(',').map(s => s.trim());
    return ids.some(id => interaction.member.roles.cache.has(id));
  });

  if (!hasAdminRole) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komutu kullanma yetkiniz yok!')], ephemeral: true });
  }

  await interaction.deferReply();

  const robloxNick = interaction.options.getString('kişi');
  const reason = interaction.options.getString('sebep');

  const userId = await robloxAPI.getUserIdByUsername(robloxNick);
  if (!userId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı bulunamadı!')] });
  }

  const universeId = await robloxAPI.getUniverseId(config.gameId);
  if (!universeId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Oyun bulunamadı! gameId\'yi kontrol edin.')] });
  }

  const result = await robloxAPI.banUserFromGame(universeId, userId, reason);

  if (result && result.success) {
    const bans = loadGameBans();
    bans[robloxNick.toLowerCase()] = {
      robloxUsername: robloxNick,
      robloxId: userId,
      reason: reason,
      bannedBy: interaction.user.username,
      bannedAt: Date.now()
    };
    saveGameBans(bans);

    const embed = new EmbedBuilder()
      .setDescription(`İşlem başarıyla tamamlandı\n\n**${robloxNick}** adlı kullanıcı oyundan yasaklandı.\n\n**Sebep**\n${reason}`)
      .setColor(0x57F287);
    await interaction.editReply({ embeds: [embed] });
  } else {
    const errMsg = result?.error || 'Bilinmeyen hata';
    await interaction.editReply({ embeds: [createErrorEmbed(`Yasaklama başarısız! ${errMsg}`)] });
  }
}

async function handleGameUnban(interaction) {
  const hasAdminRole = getGuildConfig(interaction.guild).adminRoleIds.some(idStr => {
    const ids = idStr.split(',').map(s => s.trim());
    return ids.some(id => interaction.member.roles.cache.has(id));
  });

  if (!hasAdminRole) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komutu kullanma yetkiniz yok!')], ephemeral: true });
  }

  await interaction.deferReply();

  const robloxNick = interaction.options.getString('kişi');
  const userId = await robloxAPI.getUserIdByUsername(robloxNick);
  if (!userId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı bulunamadı!')] });
  }

  const universeId = await robloxAPI.getUniverseId(config.gameId);
  if (!universeId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Oyun bulunamadı! gameId\'yi kontrol edin.')] });
  }

  try {
    const apiKey = process.env.ROBLOX_API_KEY;
    const cookie = process.env.ROBLOX_COOKIE;
    let success = false;

    if (apiKey) {
      await axios.post(
        `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}:restrict`,
        { gameJoinRestriction: { active: false } },
        { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }
      );
      success = true;
    } else if (cookie) {
      const csrfToken = await robloxAPI.getCsrfToken(cookie);
      await axios.delete(
        `https://apis.roblox.com/game-auth/v1/games/${universeId}/bans/user/${userId}`,
        { headers: { 'Cookie': `.ROBLOSECURITY=${cookie}`, 'X-CSRF-TOKEN': csrfToken } }
      );
      success = true;
    }

    if (success) {
      const bans = loadGameBans();
      delete bans[robloxNick.toLowerCase()];
      saveGameBans(bans);

      const embed = new EmbedBuilder()
        .setDescription(`İşlem başarıyla tamamlandı\n\n**${robloxNick}** adlı kullanıcının oyun yasağı kaldırıldı.`)
        .setColor(0x57F287);
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    await interaction.editReply({ embeds: [createErrorEmbed(`Yasak kaldırılamadı! ${error.response?.data?.errors?.[0]?.message || error.message}`)] });
  }
}

async function handleGamePassQuery(interaction) {
  const hasAdminRole = getGuildConfig(interaction.guild).adminRoleIds.some(idStr => {
    const ids = idStr.split(',').map(s => s.trim());
    return ids.some(id => interaction.member.roles.cache.has(id));
  });

  if (!hasAdminRole) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komutu kullanma yetkiniz yok!')], ephemeral: true });
  }

  await interaction.deferReply();

  const robloxNick = interaction.options.getString('kişi');

  const userId = await robloxAPI.getUserIdByUsername(robloxNick);
  if (!userId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Kullanıcı bulunamadı!')] });
  }

  const universeId = await robloxAPI.getUniverseId(config.gameId);
  if (!universeId) {
    return interaction.editReply({ embeds: [createErrorEmbed('Oyun bulunamadı! gameId\'yi kontrol edin.')] });
  }

  const gamePasses = await robloxAPI.getGamePasses(universeId);
  if (!gamePasses || gamePasses.length === 0) {
    return interaction.editReply({ embeds: [createErrorEmbed('Oyuna ait gamepass bulunamadı.')] });
  }

  const owned = [];
  const notOwned = [];

  for (const gp of gamePasses) {
    const owns = await robloxAPI.checkGamePassOwnership(userId, gp.id, ROBLOX_COOKIE);
    if (owns) {
      owned.push(gp.name);
    } else {
      notOwned.push(gp.name);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('Gamepass Sorgu')
    .setDescription(`**${robloxNick}** adlı kullanıcının gamepass durumu:`)
    .addFields(
      {
        name: 'Sahip Olduğu',
        value: owned.length > 0 ? owned.map(n => `• ${n}`).join('\n') : 'Yok',
        inline: true
      },
      {
        name: 'Sahip Olmadığı',
        value: notOwned.length > 0 ? notOwned.map(n => `• ${n}`).join('\n') : 'Yok',
        inline: true
      }
    )
    .setColor(owned.length > 0 ? 0x57F287 : 0xED4245)
    .setFooter({ text: `Roblox ID: ${userId}` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleGameBanQuery(interaction) {
  const hasAdminRole = getGuildConfig(interaction.guild).adminRoleIds.some(idStr => {
    const ids = idStr.split(',').map(s => s.trim());
    return ids.some(id => interaction.member.roles.cache.has(id));
  });

  if (!hasAdminRole) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komutu kullanma yetkiniz yok!')], ephemeral: true });
  }

  await interaction.deferReply();

  const robloxNick = interaction.options.getString('kişi');
  const bans = loadGameBans();
  const ban = bans[robloxNick.toLowerCase()];

  if (!ban) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setDescription(`**${robloxNick}** adlı kullanıcının oyun yasağı kaydı bulunamadı.`)
        .setColor(0x57F287)]
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Oyun Yasak Sorgu')
    .addFields(
      { name: 'Kullanıcı', value: ban.robloxUsername, inline: true },
      { name: 'Roblox ID', value: String(ban.robloxId), inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Sebep', value: ban.reason, inline: false },
      { name: 'Yasaklayan', value: ban.bannedBy, inline: true },
      { name: 'Yasak Tarihi', value: `<t:${Math.floor(ban.bannedAt / 1000)}:F>`, inline: true }
    )
    .setColor(0xED4245);

  await interaction.editReply({ embeds: [embed] });
}

async function handleBanAmnesty(interaction) {
  const AMNESTY_GUILD_ID = '1500506349518323842';
  const AMNESTY_ROLE_IDS = ['1500513256907739268', '1500512374615052375', '1500512537089806499'];

  if (interaction.guildId !== AMNESTY_GUILD_ID) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komut sadece yetkili sunucuda kullanılabilir!')], flags: 64 });
  }

  const hasRole = AMNESTY_ROLE_IDS.some(id => interaction.member.roles.cache.has(id));
  if (!hasRole) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komutu kullanma yetkiniz yok!')], flags: 64 });
  }

  await interaction.deferReply();

  const reason = interaction.options.getString('sebep') || 'Ban affı';
  const guilds = client.guilds.cache;

  let toplamYasaklı = 0;
  let toplamBaşarılı = 0;
  let toplamBaşarısız = 0;
  const sunucuSonuçları = [];

  for (const [, guild] of guilds) {
    try {
      const banList = await guild.bans.fetch();
      if (banList.size === 0) {
        sunucuSonuçları.push(`• ${guild.name}: Yasaklı yok`);
        continue;
      }

      let başarılı = 0;
      let başarısız = 0;

      for (const [userId] of banList) {
        try {
          await guild.members.unban(userId, reason);
          başarılı++;
        } catch {
          başarısız++;
        }
      }

      toplamYasaklı += banList.size;
      toplamBaşarılı += başarılı;
      toplamBaşarısız += başarısız;
      sunucuSonuçları.push(`• ${guild.name}: ${başarılı} kaldırıldı, ${başarısız} başarısız`);
    } catch {
      sunucuSonuçları.push(`• ${guild.name}: Yasak listesi alınamadı`);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('Ban Affı Tamamlandı')
    .addFields(
      { name: 'Toplam Yasaklı', value: `\`${toplamYasaklı}\``, inline: true },
      { name: 'Yasağı Kaldırılan', value: `\`${toplamBaşarılı}\``, inline: true },
      { name: 'Başarısız', value: `\`${toplamBaşarısız}\``, inline: true },
      { name: 'Sebep', value: reason, inline: false },
      { name: 'Sunucu Detayları', value: sunucuSonuçları.join('\n') || 'Yok', inline: false }
    )
    .setColor(0x57F287)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handlePing(interaction) {
  const sent = await interaction.reply({ content: 'Ölçülüyor...', fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const wsLatency = client.ws.ping;

  const embed = new EmbedBuilder()
    .setTitle('🏓 Pong!')
    .addFields(
      { name: 'Bot Gecikmesi', value: `\`${latency}ms\``, inline: true },
      { name: 'WebSocket', value: `\`${wsLatency}ms\``, inline: true }
    )
    .setColor(latency < 100 ? 0x57F287 : latency < 300 ? 0xFEE75C : 0xED4245)
    .setTimestamp();

  await interaction.editReply({ content: '', embeds: [embed] });
}

async function handleAnnouncement(interaction) {
  const ANNOUNCEMENT_GUILD_ID = '1500506349518323842';
  const ANNOUNCEMENT_ROLE_IDS = ['1500512860403667075', '1500512590022049823', '1501278785998295192', '1500513256907739268', '1500512374615052375', '1500512537089806499'];

  const message = interaction.options.getString('mesaj');
  const channelName = interaction.options.getString('kanal_adi');
  const attachment = interaction.options.getAttachment('görsel');

  // Sadece belirtilen sunucuda kullanılabilir
  if (interaction.guildId !== ANNOUNCEMENT_GUILD_ID) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komut sadece yetkili sunucuda kullanılabilir!')], flags: 64 });
  }

  if (!message && !attachment) {
    return interaction.reply({ embeds: [createErrorEmbed('Mesaj veya görsel en az birini girmelisiniz!')], ephemeral: true });
  }

  // Yetki kontrolü: Sadece belirtilen sunucudaki belirtilen rollere sahip kişiler kullanabilir
  let memberInTargetGuild = null;
  try {
    const targetGuild = await client.guilds.fetch(ANNOUNCEMENT_GUILD_ID);
    memberInTargetGuild = await targetGuild.members.fetch(interaction.user.id);
  } catch (e) {}

  if (!memberInTargetGuild) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komutu kullanmak için gerekli sunucuda bulunmuyor veya yetkiniz yok!')], flags: 64 });
  }

  const userRoleId = ANNOUNCEMENT_ROLE_IDS.find(id => memberInTargetGuild.roles.cache.has(id));
  if (!userRoleId) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komutu kullanma yetkiniz yok!')], flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  // İmza: kullanıcı adı + sahip olduğu rolün adı
  const roleName = memberInTargetGuild.roles.cache.get(userRoleId)?.name || '';
  const signatureText = `${interaction.user.username}, ${roleName}`;
  const signature = `\n-# ${signatureText}`;
  const fullContent = message ? `${message}${signature}` : signature.trim();

  const sentGuilds = [];

  client.guilds.cache.forEach(guild => {
    const channel = guild.channels.cache.find(c => c.name.toLowerCase() === channelName.toLowerCase() && c.isTextBased());
    if (channel) {
      const payload = { content: fullContent };
      if (attachment) payload.files = [attachment.url];
      channel.send(payload).catch(() => {});
      sentGuilds.push(guild.name);
    }
  });

  const listText = sentGuilds.length > 0
    ? sentGuilds.map(name => `• ${name}`).join('\n')
    : 'Hiçbir sunucuda uygun kanal bulunamadı.';

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle('Duyuru Gönderildi')
        .setDescription(`**${sentGuilds.length} sunucuya gönderildi:**\n\n${listText}`)
        .setColor(0x57F287)
    ]
  });
}

async function handleTicketSetup(interaction) {
  const hasAdminRole = getGuildConfig(interaction.guild).adminRoleIds.some(idStr => {
    const ids = idStr.split(',').map(s => s.trim());
    return ids.some(id => interaction.member.roles.cache.has(id));
  });

  if (!hasAdminRole) {
    return interaction.reply({ content: 'Bu komutu kullanma yetkiniz yok!', flags: 64 });
  }

  const imageUrl = config.ticketImageUrl || '';
  
  const embed = new EmbedBuilder()
    .setTitle('Turkish Armed Forces')
    .setDescription('**Moderatör Bileti**\nDiscord ile ilgili yaşanan sorunlar ve yardım talepleri için bu bileti seç.\n\n**Gamepass Bileti**\nRobux ile rütbe, branş üyeliği alımında bu bilet türünü seç.\n\n**Oyun Destek Bileti**\nOyunumuzda yaşanan sorunlar hakkında yardım almak için bu bileti seç.\n\n**Rütbe Destek Bileti**\nRütbeniz hakkında yaşanan sorunlar hakkında yardım almak için bu bileti seç.(Rütbem Gitti)\n\n**Reklam Destek Bileti**\nDiscord veya Oyun üzerinde reklam yapan insanları şikayet edebilmek için bu bilet türünü seç.\n\n**Geri Dönüş&Transfer Bileti**\nGeri dönüş veya transfer işlemleri hakkında destek almak için bu bileti seç.')
    .setImage(imageUrl)
    .setColor(0x2B2D31);
  
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category')
    .setPlaceholder('Destek Kategorisi Seç!')
    .addOptions([
      { label: 'Moderatör Bileti', value: 'mod', description: 'Discord sorunları ve yardım talepleri için', emoji: { name: 'aek_mod', id: '1419405116875739227' } },
      { label: 'Gamepass Bileti', value: 'gamepass', description: 'Robux ile rütbe veya branş üyeliği alımı için', emoji: { name: 'takviye_aek', id: '1419778033509994546' } },
      { label: 'Oyun Destek Bileti', value: 'game_support', description: 'Oyunumuzda yaşanan sorunlar için', emoji: { name: 'aek_ynalgelis', id: '1420057691077873736' } },
      { label: 'Rütbe Destek Bileti', value: 'rank_support', description: 'Rütbeniz hakkında yaşanan sorunlar için', emoji: { name: 'rutbe', id: '1418328091339788378' } },
      { label: 'Reklam Destek Bileti', value: 'report', description: 'Reklam yapan kişileri şikayet etmek için', emoji: { name: 'uyarii', id: '1421639888067104907' } },
      { label: 'Geri Dönüş & Transfer Bileti', value: 'transfer', description: 'Geri dönüş veya transfer işlemleri için', emoji: { name: 'personel', id: '1420217336136339537' } }
    ]);

  const row = new ActionRowBuilder().addComponents(menu);

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '✓', flags: 64 });
  await interaction.deleteReply();
}

async function handleTicketMenuButton(interaction) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category')
    .setPlaceholder('Bir bilet türü seçin')
    .addOptions([
      { label: 'Moderatör Bileti', value: 'mod', description: 'Discord sorunları ve yardım talepleri' },
      { label: 'Gamepass Bileti', value: 'gamepass', description: 'Robux ile rütbe/branş alımı' },
      { label: 'Oyun Destek Bileti', value: 'game_support', description: 'Oyun içi yardım' },
      { label: 'Rütbe Destek Bileti', value: 'rank_support', description: 'Rütbe sorunları' },
      { label: 'Reklam Destek Bileti', value: 'report', description: 'Reklam şikayetleri' },
      { label: 'Geri Dönüş&Transfer Bileti', value: 'transfer', description: 'Geri dönüş veya transfer' }
    ]);

  await interaction.reply({ content: 'Lütfen talep kategorisini seçin:', components: [new ActionRowBuilder().addComponents(menu)], flags: 64 });
}

async function handleTicketCategorySelect(interaction) {
  const category = interaction.values[0];
  const guild = interaction.guild;
  const user = interaction.user;

  const categoryNames = {
    'mod': 'Moderatör',
    'gamepass': 'Gamepass',
    'game_support': 'Oyun Destek',
    'rank_support': 'Rütbe Destek',
    'report': 'Reklam Şikayet',
    'transfer': 'Geri Dönüş/Transfer'
  };

  const channelName = `bilet-${category}-${user.username}`.toLowerCase();
  
  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId || null,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        ...config.adminRoleIds.map(roleIdStr => {
          const ids = roleIdStr.split(',').map(s => s.trim());
          return ids.map(id => ({
            id: id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          }));
        }).flat()
      ],
    });

    const embed = new EmbedBuilder()
      .setTitle('Bilet Açıldı')
      .setDescription(`Merhaba ${user}, **${categoryNames[category]}** kategorisinde bir bilet açtınız. Yetkililer en kısa sürede size yardımcı olacaktır.`)
      .setColor(0x5865F2)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Bileti Kapat').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('claim_ticket').setLabel('Bileti Üstlen').setStyle(ButtonStyle.Success)
    );

    const supportMention = config.supportRoleIds && config.supportRoleIds.length > 0 
      ? config.supportRoleIds.map(roleIdStr => {
          return roleIdStr.split(',').map(id => `<@&${id.trim()}>`).join(' ');
        }).join(' ')
      : `<@&${config.adminRoleIds[0].split(',')[0].trim()}>`;

    await channel.send({ content: `${user} | ${supportMention}`, embeds: [embed], components: [row] });
    await interaction.reply({ content: `Biletiniz açıldı: ${channel}`, flags: 64 });
    
    // Log kanalına mesaj gönder
    if (config.ticketLogChannelId) {
      const logChannel = guild.channels.cache.get(config.ticketLogChannelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('Yeni Bilet Açıldı')
          .addFields(
            { name: 'Kullanıcı', value: `${user} (${user.id})`, inline: true },
            { name: 'Kategori', value: categoryNames[category], inline: true },
            { name: 'Kanal', value: `${channel}`, inline: true }
          )
          .setColor(0x5865F2)
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    }
  } catch (error) {
    console.error('Ticket açma hatası:', error);
    await interaction.reply({ content: 'HATA: Bilet kanalı oluşturulamadı!', flags: 64 });
  }
}

async function handleTicketClose(interaction) {
  const channel = interaction.channel;
  const user = interaction.user;

  // Hemen yanıt vererek zaman aşımını (Unknown Interaction) önle
  await interaction.reply({ content: 'Bilet kapatılıyor ve transcript hazırlanıyor...', flags: 64 }).catch(() => {});

  // Transcript oluşturma (basit metin bazlı)
  let transcript = `Bilet Transcript - ${channel.name}\n\n`;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    
    sortedMessages.forEach(m => {
      transcript += `[${new Date(m.createdTimestamp).toLocaleString('tr-TR')}] ${m.author.tag}: ${m.content}\n`;
      if (m.embeds.length > 0) transcript += `[Embed Mesajı]\n`;
    });
  } catch (e) {
    console.error("Transcript mesaj çekme hatası:", e);
    transcript += "Mesajlar çekilirken bir hata oluştu.\n";
  }

  // Log kanalına transcript gönder
  if (config.ticketLogChannelId) {
    const logChannel = interaction.guild.channels.cache.get(config.ticketLogChannelId);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('Bilet Kapatıldı')
        .addFields(
          { name: 'Kapatan', value: `${user.tag}`, inline: true },
          { name: 'Kanal', value: `${channel.name}`, inline: true }
        )
        .setColor(0xED4245)
        .setTimestamp();
      
      const buffer = Buffer.from(transcript, 'utf-8');
      await logChannel.send({ 
        embeds: [logEmbed],
        files: [{ attachment: buffer, name: `${channel.name}-transcript.txt` }]
      }).catch(e => console.error("Log kanalına gönderim hatası:", e));
    }
  }

  // Kullanıcıya DM gönder
  try {
    const ticketOwnerMatch = channel.name.match(/bilet-[^-]+-(.+)/);
    if (ticketOwnerMatch) {
      const ownerUsername = ticketOwnerMatch[1];
      const guildMembers = await interaction.guild.members.fetch();
      const owner = guildMembers.find(m => m.user.username.toLowerCase() === ownerUsername.toLowerCase());
      
      if (owner) {
        const dmEmbed = new EmbedBuilder()
          .setTitle('Biletiniz Kapatıldı')
          .setDescription(`**${interaction.guild.name}** sunucusundaki biletiniz kapatıldı. Aşağıda biletinizin dökümü (transcript) yer almaktadır.`)
          .setColor(0x5865F2)
          .setTimestamp();
          
        const buffer = Buffer.from(transcript, 'utf-8');
        await owner.send({ 
          embeds: [dmEmbed],
          files: [{ attachment: buffer, name: `bilet-dokumu.txt` }]
        }).catch(() => console.log("Kullanıcıya DM gönderilemedi."));
      }
    }
  } catch (e) {
    console.error("Transcript DM hatası:", e);
  }

  setTimeout(() => channel.delete().catch(() => {}), 2000);
}

async function handleTicketClaim(interaction) {
  const user = interaction.user;
  const channel = interaction.channel;
  
  await interaction.reply({ content: `Bilet <@${user.id}> tarafından üstlenildi.` });

  // Log kanalına bilgi gönder
  if (config.ticketLogChannelId) {
    const logChannel = interaction.guild.channels.cache.get(config.ticketLogChannelId);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('Bilet Üstlenildi')
        .addFields(
          { name: 'Yetkili', value: `${user.tag} (${user.id})`, inline: true },
          { name: 'Bilet', value: `${channel.name}`, inline: true }
        )
        .setColor(0x57F287)
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] });
    }
  }
}



async function handleBan(interaction) {
  // Config'deki admin rollerini kontrol et (Virgüllü format desteğiyle)
  const hasAdminRole = getGuildConfig(interaction.guild).adminRoleIds.some(idStr => {
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

    try {
      await user.send(`**${interaction.user.username}** tarafından tüm TKT sunucularına yasaklandınız.\nSebep: ${reason}`);
    } catch (dmError) {
      console.warn(`DM gönderilemedi (${discordUserId}): ${dmError.message}`);
    }
    
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
  const hasAdminRole = getGuildConfig(interaction.guild).adminRoleIds.some(idStr => {
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
    
    let description = `İşlem başarıyla tamamlandı\n\n<@${discordUserId}> Kişisinin TKT sunucularından yasaklamaları başarıyla kaldırıldı.\n\n**Sebep**\n${reason}\n\n`;
    
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

async function handleBanQuery(interaction) {
  const hasAdminRole = getGuildConfig(interaction.guild).adminRoleIds.some(idStr => {
    const ids = idStr.split(',').map(s => s.trim());
    return ids.some(id => interaction.member.roles.cache.has(id));
  });

  if (!hasAdminRole) {
    return interaction.reply({ embeds: [createErrorEmbed('Bu komutu kullanma yetkiniz yok!')], ephemeral: true });
  }

  await interaction.deferReply();

  const discordUserId = interaction.options.getString('kişi');

  try {
    let user;
    try {
      user = await client.users.fetch(discordUserId);
    } catch {
      return interaction.editReply({ embeds: [createErrorEmbed('Geçersiz kullanıcı ID\'si! Kullanıcı bulunamadı.')] });
    }

    const guilds = client.guilds.cache;
    const bannedIn = [];
    const notBannedIn = [];

    for (const [guildId, guild] of guilds) {
      try {
        const ban = await guild.bans.fetch(discordUserId);
        bannedIn.push({ name: guild.name, reason: ban.reason || 'Sebep belirtilmemiş' });
      } catch {
        notBannedIn.push(guild.name);
      }
    }

    const isBanned = bannedIn.length > 0;
    const color = isBanned ? 0xED4245 : 0x57F287;

    const embed = new EmbedBuilder()
      .setTitle('Tam Yasak Sorgu')
      .setDescription(`**${user.tag}** kullanıcısının tüm sunuculardaki yasak durumu:`)
      .setColor(color)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: 'Yasaklı',
          value: bannedIn.length > 0 ? bannedIn.map(b => `• ${b.name}`).join('\n') : 'Yok',
          inline: true
        },
        {
          name: 'Yasaksız',
          value: notBannedIn.length > 0 ? notBannedIn.map(name => `• ${name}`).join('\n') : 'Yok',
          inline: true
        }
      )
      .setFooter({ text: `Kullanıcı ID: ${discordUserId}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Tamyasak sorgu hatası:', error);
    await interaction.editReply({ embeds: [createErrorEmbed('Sorgu sırasında bir hata oluştu!')] });
  }
}

async function handleActivityQuery(interaction) {
  await interaction.deferReply();
  
  const { gameId } = getGuildConfig(interaction.guild);
  const activity = await robloxAPI.getGameActivity(gameId);
  
  if (!activity) {
    return interaction.editReply({ embeds: [createErrorEmbed('Oyun bilgisi alınamadı!')] });
  }
  
  const embed = new EmbedBuilder()
    .setDescription(`**${activity.name}** oyununun mevcut aktifliği: **${activity.playing}** oyuncu`)
    .setColor(0x57F287);
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleIttifakBransAktiflik(interaction) {
  await interaction.deferReply();

  const aekAdminRoleIds = config.adminRoleIds || [];
  const atfAdminRoleIds = (config.atf && config.atf.adminRoleIds) || [];
  const allAdminRoleIds = [...aekAdminRoleIds, ...atfAdminRoleIds];

  const hasPermission = allAdminRoleIds.some(idStr => {
    const ids = idStr.split(',').map(s => s.trim());
    return ids.some(id => interaction.member.roles.cache.has(id));
  });

  if (!hasPermission) {
    return interaction.editReply({ embeds: [createErrorEmbed('Bu komutu sadece **İttifak Yetkilileri** kullanabilir!')] });
  }

  const branchNames = {
    DKK: 'Deniz Kuvvetleri Komutanlığı',
    KKK: 'Kara Kuvvetleri Komutanlığı',
    HKK: 'Hava Kuvvetleri Komutanlığı',
    OKK: 'Özel Kuvvetler Komutanlığı',
    JGK: 'Jandarma Genel Komutanlığı',
    ASIZ: 'Askeri İnzibat'
  };

  function readTeamFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (e) {}
    return { teams: {}, last_update: 0 };
  }

  function buildRankText(teamData) {
    const sorted = Object.entries(teamData.teams)
      .map(([key, count]) => ({ key, name: branchNames[key] || key, count: Number(count) || 0 }))
      .sort((a, b) => b.count - a.count);
    if (sorted.length === 0) return 'Veri bulunamadı.';
    return sorted.map((b, i) => `**${i + 1}. ${b.name}**\n└ Aktif Personel: \`${b.count}\``).join('\n\n');
  }

  const aekData = readTeamFile(TEAM_ACTIVITY_FILE);
  const atfData = readTeamFile(TEAM_ACTIVITY_ATF_FILE);

  const aekUpdate = aekData.last_update > 0 ? new Date(aekData.last_update).toLocaleTimeString('tr-TR') : 'Yok';
  const atfUpdate = atfData.last_update > 0 ? new Date(atfData.last_update).toLocaleTimeString('tr-TR') : 'Yok';

  const embed = new EmbedBuilder()
    .setTitle('İTTİFAK BRANŞ AKTİFLİK RAPORU')
    .setDescription('TKT ve ATF branşlarının anlık aktiflik verileri aşağıda ayrı ayrı listelenmiştir.')
    .addFields(
      { name: 'TKT — BRANŞLAR', value: buildRankText(aekData), inline: false },
      { name: '\u200b', value: '\u200b', inline: false },
      { name: 'ATF — BRANŞLAR', value: buildRankText(atfData), inline: false }
    )
    .setColor(0x2B2D31)
    .setFooter({ text: `TKT Son Güncelleme: ${aekUpdate} | ATF Son Güncelleme: ${atfUpdate}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleIttifakActivity(interaction) {
  await interaction.deferReply();

  const [aekActivity, atfActivity] = await Promise.all([
    robloxAPI.getGameActivity(config.gameId),
    robloxAPI.getGameActivity(config.atf.gameId)
  ]);

  const aekText = aekActivity ? `${aekActivity.playing}` : 'Alınamadı';
  const atfText = atfActivity ? `${atfActivity.playing}` : 'Alınamadı';

  const embed = new EmbedBuilder()
    .setDescription(`**TKT oyununun aktifliği: ${aekText}**\n**ATF oyununun aktifliği: ${atfText}**`)
    .setColor(0x2B2D31);

  await interaction.editReply({ embeds: [embed] });
}

const TEAM_ACTIVITY_FILE = './data/team_activity.json';
const TEAM_ACTIVITY_ATF_FILE = './data/team_activity_atf.json';

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
  if (secret !== process.env.ROBLOX_API_KEY && secret !== 'TKT_SECRET_123') {
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

app.post('/update-teams-atf', (req, res) => {
  const { teams, secret } = req.body;
  if (secret !== process.env.ROBLOX_API_KEY && secret !== 'TKT_SECRET_123') {
    return res.status(403).send('Unauthorized');
  }
  if (teams) {
    try {
      const data = { teams: teams, last_update: Date.now() };
      fs.writeFileSync(TEAM_ACTIVITY_ATF_FILE, JSON.stringify(data, null, 2));
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

  const { gameId } = getGuildConfig(interaction.guild);
  const activity = await robloxAPI.getGameActivity(gameId);
  
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

// Otomatik ses kanalı bağlantısı
client.once('clientReady', () => {
  const channelId = config.autoVoiceChannelId;
  const guildId = config.autoVoiceGuildId;

  if (!channelId || !guildId) {
    console.log('Otomatik ses kanalı yapılandırılmamış, atlanıyor.');
    return;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.warn(`Ses kanalı için sunucu bulunamadı: ${guildId}`);
    return;
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    console.warn(`Ses kanalı bulunamadı: ${channelId}`);
    return;
  }

  joinVoiceChannel({
    channelId: channelId,
    guildId: guildId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true
  });

  console.log(`Otomatik olarak "${channel.name}" ses kanalına bağlanıldı.`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();
  if (content === 'sa' || content === 'selamün aleykum') {
    message.channel.send('Aleyküm selam,hoş geldin!').catch(() => {});
  }
});

client.login(DISCORD_TOKEN);
