const axios = require('axios');

class RobloxAPI {
  constructor() {
    this.baseURL = 'https://api.roblox.com';
    this.groupsURL = 'https://groups.roblox.com';
    this.usersURL = 'https://users.roblox.com';
    this.gamesURL = 'https://games.roblox.com';
  }

  // Kullanıcı adından Roblox ID'sini al
  async getUserIdByUsername(username) {
    try {
      const response = await axios.post(`${this.usersURL}/v1/usernames/users`, {
        usernames: [username],
        excludeBannedUsers: false
      });
      
      if (response.data.data && response.data.data.length > 0) {
        return response.data.data[0].id;
      }
      return null;
    } catch (error) {
      console.error('Kullanıcı ID alınırken hata:', error.message);
      return null;
    }
  }

  // Kullanıcının grup rütbesini al
  async getUserRankInGroup(userId, groupId) {
    try {
      const response = await axios.get(`${this.groupsURL}/v1/users/${userId}/groups/roles`);
      const group = response.data.data.find(g => g.group.id === parseInt(groupId));
      
      if (group) {
        return {
          rank: group.role.rank,
          name: group.role.name,
          id: group.role.id
        };
      }
      return null;
    } catch (error) {
      console.error('Grup rütbesi alınırken hata:', error.message);
      return null;
    }
  }

  // Kullanıcının tüm gruplarını al
  async getUserGroups(userId) {
    try {
      const response = await axios.get(`${this.groupsURL}/v1/users/${userId}/groups/roles`);
      
      if (response.data.data && response.data.data.length > 0) {
        return response.data.data.map(g => ({
          groupId: g.group.id,
          groupName: g.group.name,
          rank: g.role.rank,
          roleName: g.role.name
        }));
      }
      return [];
    } catch (error) {
      console.error('Kullanıcı grupları alınırken hata:', error.message);
      return null;
    }
  }

  // Gruptaki tüm rütbeleri al
  async getGroupRoles(groupId) {
    try {
      const response = await axios.get(`${this.groupsURL}/v1/groups/${groupId}/roles`);
      return response.data.roles;
    } catch (error) {
      console.error('Grup rütbeleri alınırken hata:', error.message);
      return null;
    }
  }

  // Kullanıcının rütbesini değiştir (ROBLOX_COOKIE gerekli)
  async setUserRole(userId, groupId, roleId, cookie) {
    try {
      console.log(`[setUserRole] userId: ${userId}, groupId: ${groupId}, roleId: ${roleId}`);
      console.log(`[setUserRole] Cookie uzunluğu: ${cookie?.length || 0}`);
      
      const response = await axios.patch(
        `${this.groupsURL}/v1/groups/${groupId}/users/${userId}`,
        { roleId: roleId },
        {
          headers: {
            'Cookie': `.ROBLOSECURITY=${cookie}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('[setUserRole] Başarılı:', response.data);
      return response.data;
    } catch (error) {
      console.log(`[setUserRole] İlk istek hatası - Status: ${error.response?.status}`);
      console.log(`[setUserRole] Hata detayı:`, JSON.stringify(error.response?.data || error.message));
      
      if (error.response?.status === 403 && error.response?.headers['x-csrf-token']) {
        const csrfToken = error.response.headers['x-csrf-token'];
        console.log('[setUserRole] CSRF token alındı, tekrar deneniyor...');
        try {
          const retryResponse = await axios.patch(
            `${this.groupsURL}/v1/groups/${groupId}/users/${userId}`,
            { roleId: roleId },
            {
              headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
              }
            }
          );
          console.log('[setUserRole] Retry başarılı:', retryResponse.data);
          return retryResponse.data;
        } catch (retryError) {
          console.error('[setUserRole] Retry hatası - Status:', retryError.response?.status);
          console.error('[setUserRole] Retry hata detayı:', JSON.stringify(retryError.response?.data || retryError.message));
          return { error: retryError.response?.data || retryError.message };
        }
      }
      return { error: error.response?.data || error.message };
    }
  }

  // Kullanıcıyı gruptan yasakla (ROBLOX_COOKIE gerekli)
  async banUserFromGroup(userId, groupId, cookie) {
    try {
      const response = await axios.delete(
        `${this.groupsURL}/v1/groups/${groupId}/users/${userId}`,
        {
          headers: {
            'Cookie': `.ROBLOSECURITY=${cookie}`
          }
        }
      );
      return true;
    } catch (error) {
      if (error.response?.status === 403 && error.response?.headers['x-csrf-token']) {
        const csrfToken = error.response.headers['x-csrf-token'];
        try {
          const retryResponse = await axios.delete(
            `${this.groupsURL}/v1/groups/${groupId}/users/${userId}`,
            {
              headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'X-CSRF-TOKEN': csrfToken
              }
            }
          );
          return true;
        } catch (retryError) {
          console.error('Yasaklama hatası (retry):', retryError.response?.data || retryError.message);
          return false;
        }
      }
      console.error('Yasaklama hatası:', error.response?.data || error.message);
      return false;
    }
  }

  // Place ID'den Universe ID'yi al
  async getUniverseId(placeId) {
    try {
      const response = await axios.get(
        `https://apis.roblox.com/universes/v1/places/${placeId}/universe`
      );
      return response.data.universeId;
    } catch (error) {
      console.error('Universe ID alınırken hata:', error.message);
      return null;
    }
  }

  // Oyun aktifliğini al (Place ID kullanarak)
  async getGameActivity(placeId) {
    try {
      // Place ID'yi Universe ID'ye çevir
      const universeId = await this.getUniverseId(placeId);
      if (!universeId) {
        return null;
      }

      const response = await axios.get(
        `${this.gamesURL}/v1/games?universeIds=${universeId}`
      );
      
      if (response.data.data && response.data.data.length > 0) {
        const game = response.data.data[0];
        return {
          playing: game.playing,
          visits: game.visits,
          maxPlayers: game.maxPlayers,
          name: game.name
        };
      }
      return null;
    } catch (error) {
      console.error('Oyun aktifliği alınırken hata:', error.message);
      return null;
    }
  }

  // Oyunun tüm gamepasslerini getir
  async getGamePasses(universeId) {
    try {
      const response = await axios.get(
        `${this.gamesURL}/v1/games/${universeId}/game-passes?sortOrder=Asc&limit=100`
      );
      return response.data.data || [];
    } catch (error) {
      console.error('Gamepass listesi alınırken hata:', error.message);
      return [];
    }
  }

  // Kullanıcının belirli bir gamepasse sahip olup olmadığını kontrol et
  async checkGamePassOwnership(userId, gamePassId, cookie) {
    try {
      const headers = {};
      if (cookie) headers['Cookie'] = `.ROBLOSECURITY=${cookie}`;

      const response = await axios.get(
        `https://inventory.roblox.com/v1/users/${userId}/items/GamePass/${gamePassId}`,
        { headers }
      );
      return response.data.data && response.data.data.length > 0;
    } catch (error) {
      // Envanter gizliyse veya erişim reddedildiyse Cloud API ile dene
      try {
        const apiKey = process.env.ROBLOX_API_KEY;
        if (apiKey) {
          const cloudResponse = await axios.get(
            `https://apis.roblox.com/cloud/v2/users/${userId}/inventory-items?filter=gamePassIds=${gamePassId}`,
            { headers: { 'x-api-key': apiKey } }
          );
          return cloudResponse.data.inventoryItems && cloudResponse.data.inventoryItems.length > 0;
        }
      } catch (e) {}
      return false;
    }
  }

  // Kullanıcı bilgilerini al
  async getUserInfo(userId) {
    try {
      const response = await axios.get(`${this.usersURL}/v1/users/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Kullanıcı bilgisi alınırken hata:', error.message);
      return null;
    }
  }

  // Kullanıcının profil açıklamasını kontrol et
  async verifyUserOwnership(userId, verificationCode) {
    try {
      const userInfo = await this.getUserInfo(userId);
      if (!userInfo || !userInfo.description) {
        return false;
      }
      
      // Profil açıklamasında doğrulama kodunu ara
      return userInfo.description.includes(verificationCode);
    } catch (error) {
      console.error('Hesap doğrulama hatası:', error.message);
      return false;
    }
  }

  // Grup katılma isteklerini getir
  async getJoinRequests(groupId, cookie) {
    try {
      const response = await axios.get(
        `${this.groupsURL}/v1/groups/${groupId}/join-requests?sortOrder=Desc&limit=100`,
        {
          headers: {
            'Cookie': `.ROBLOSECURITY=${cookie}`
          }
        }
      );
      return response.data.data || [];
    } catch (error) {
      console.error('Katılma istekleri alınırken hata:', error.message);
      return null;
    }
  }

  // Grup katılma isteğini kabul et
  async acceptJoinRequest(groupId, userId, cookie) {
    try {
      const response = await axios.post(
        `${this.groupsURL}/v1/groups/${groupId}/join-requests/users/${userId}`,
        {},
        {
          headers: {
            'Cookie': `.ROBLOSECURITY=${cookie}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return true;
    } catch (error) {
      if (error.response?.status === 403 && error.response?.headers['x-csrf-token']) {
        const csrfToken = error.response.headers['x-csrf-token'];
        try {
          const retryResponse = await axios.post(
            `${this.groupsURL}/v1/groups/${groupId}/join-requests/users/${userId}`,
            {},
            {
              headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
              }
            }
          );
          return true;
        } catch (retryError) {
          console.error('İstek kabul hatası (retry):', retryError.response?.data || retryError.message);
          return false;
        }
      }
      console.error('İstek kabul hatası:', error.response?.data || error.message);
      return false;
    }
  }

  // Grup katılma isteğini reddet
  async rejectJoinRequest(groupId, userId, cookie) {
    try {
      const response = await axios.delete(
        `${this.groupsURL}/v1/groups/${groupId}/join-requests/users/${userId}`,
        {
          headers: {
            'Cookie': `.ROBLOSECURITY=${cookie}`
          }
        }
      );
      return true;
    } catch (error) {
      if (error.response?.status === 403 && error.response?.headers['x-csrf-token']) {
        const csrfToken = error.response.headers['x-csrf-token'];
        try {
          const retryResponse = await axios.delete(
            `${this.groupsURL}/v1/groups/${groupId}/join-requests/users/${userId}`,
            {
              headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'X-CSRF-TOKEN': csrfToken
              }
            }
          );
          return true;
        } catch (retryError) {
          console.error('İstek red hatası (retry):', retryError.response?.data || retryError.message);
          return false;
        }
      }
      console.error('İstek red hatası:', error.response?.data || error.message);
      return false;
    }
  }
  // Roblox API kullanarak kullanıcıyı oyundan banla
  async banUserFromGame(universeId, userId, reason) {
    try {
      console.log(`[banUserFromGame] Başlatılıyor - UniverseId: ${universeId}, UserId: ${userId}`);
      
      const apiKey = process.env.ROBLOX_API_KEY;
      const cookie = process.env.ROBLOX_COOKIE;

      // Yöntem 1: API Key varsa Cloud V2 kullan (En güvenilir yol)
      if (apiKey) {
        try {
          const response = await axios.post(
            `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}:restrict`,
            {
              gameJoinRestriction: {
                active: true,
                reason: reason,
                displayReason: reason,
                duration: null
              }
            },
            {
              headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log('[banUserFromGame] Cloud V2 (API Key) Başarılı');
          return { success: true };
        } catch (err) {
          console.warn('[banUserFromGame] API Key denemesi başarısız, Cookie deneniyor...');
        }
      }

      // Yöntem 2: API Key yoksa veya başarısızsa Cookie ile Legacy API dene
      if (cookie) {
        const csrfToken = await this.getCsrfToken(cookie);
        if (!csrfToken) {
          throw new Error('CSRF token alınamadı (Çerez geçersiz olabilir)');
        }

        // Önce normal oyun banlamayı dene (Legacy)
        try {
          console.log('[banUserFromGame] Legacy API deneniyor...');
          await axios.post(
            `https://apis.roblox.com/game-auth/v1/games/${universeId}/bans/user/${userId}`,
            { reason: reason, displayReason: reason, duration: 0 },
            {
              headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
              }
            }
          );
          console.log('[banUserFromGame] Legacy API (Cookie) Başarılı');
          return { success: true };
        } catch (err) {
          console.warn('[banUserFromGame] Legacy API başarısız, Grup Banı deneniyor...');
          
          // Eğer oyun banı başarısız olursa, alternatif olarak GRUPTAN BANLAMAYI dene
          // Bu yöntem çerez yetkisi olan hesap grupta yöneticiyse çalışır.
          try {
            const groupId = process.env.ROBLOX_GROUP_ID || '10919576'; // Varsayılan grup ID
            const groupBanResponse = await axios.post(
              `https://groups.roblox.com/v1/groups/${groupId}/users/${userId}/ban`,
              { reason: reason },
              {
                headers: {
                  'Cookie': `.ROBLOSECURITY=${cookie}`,
                  'Content-Type': 'application/json',
                  'X-CSRF-TOKEN': csrfToken
                }
              }
            );
            console.log('[banUserFromGame] Grup Banı Başarılı');
            return { success: true, message: 'Oyun banı başarısız oldu ancak kullanıcı gruptan yasaklandı.' };
          } catch (groupErr) {
            console.error('[banUserFromGame] Grup Banı hatası:', groupErr.response?.data || groupErr.message);
            
            if (err.response?.status === 404) {
              return { 
                success: false, 
                error: 'Roblox bu oyun için doğrudan banlama izni vermiyor. Çözüm: Oyunun Sahibi (Owner) hesabı üzerinden API Key almalı veya bot hesabı grupta "Ban" yetkisine sahip olmalıdır.' 
              };
            }
            throw groupErr;
          }
        }
      }

      throw new Error('Ne ROBLOX_API_KEY ne de ROBLOX_COOKIE bulundu.');
    } catch (error) {
      const errorData = error.response?.data;
      const statusCode = error.response?.status;
      
      console.error(`[banUserFromGame] Hata - Status: ${statusCode}`, JSON.stringify(errorData || error.message));
      
      if (statusCode === 403) {
        return { success: false, error: 'Yetki reddedildi (403). Botun veya çerezin oyunda ban yetkisi olduğundan emin olun.' };
      }
      
      return { success: false, error: errorData?.errors?.[0]?.message || error.message || 'Bilinmeyen hata' };
    }
  }

  async getCsrfToken(cookie) {
    try {
      await axios.post('https://auth.roblox.com/v2/logout', {}, {
        headers: { 'Cookie': `.ROBLOSECURITY=${cookie}` }
      });
      return null;
    } catch (error) {
      return error.response?.headers['x-csrf-token'] || null;
    }
  }
}

module.exports = new RobloxAPI();
