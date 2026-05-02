local HttpService = game:GetService("HttpService")
local Teams = game:GetService("Teams")

-- AYARLAR
local BOT_URL = "https://REPLIT_ADRESIN/update-teams" -- Replit URL'ini buraya yaz
local SECRET = "AEK_SECRET_123"
local GUNCELLEME_SURESI = 30 -- Kaç saniyede bir güncelleme yapılsın

-- Roblox takım adı --> Bot'taki anahtar eşleştirmesi
local TAKIM_ESLESTIRME = {
	["TSK"] = "TSK",
	["Ordu Generalleri"] = "OG",
	["Ordu Subayları"] = "OS",
}

local function takimleriTopla()
	local sonuc = {}

	for robloxAdi, botAnahtari in pairs(TAKIM_ESLESTIRME) do
		sonuc[botAnahtari] = 0
	end

	for _, takim in ipairs(Teams:GetTeams()) do
		local botAnahtari = TAKIM_ESLESTIRME[takim.Name]
		if botAnahtari then
			sonuc[botAnahtari] = #takim:GetPlayers()
		end
	end

	return sonuc
end

local function veriGonder()
	local basari, hata = pcall(function()
		local takimVerisi = takimleriTopla()

		local veri = HttpService:JSONEncode({
			secret = SECRET,
			teams = takimVerisi
		})

		local yanit = HttpService:PostAsync(BOT_URL, veri, Enum.HttpContentType.ApplicationJson)
		print("[AEK Bot] Takım verisi gönderildi:", yanit)
	end)

	if not basari then
		warn("[AEK Bot] Veri gönderilemedi:", hata)
	end
end

-- Başlangıçta bir kez gönder, sonra periyodik olarak tekrarla
veriGonder()
while true do
	task.wait(GUNCELLEME_SURESI)
	veriGonder()
end
