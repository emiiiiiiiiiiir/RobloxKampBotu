--[[
    AEK Branş Aktiflik Takip Sistemi (Roblox Studio Script)
    
    Bu scripti Roblox Studio içinde "ServerScriptService" altına yapıştırın.
    Her 60 saniyede bir oyundaki takımların oyuncu sayısını Discord botunuza iletir.
]]

local HttpService = game:GetService("HttpService")
local Teams = game:GetService("Teams")

-- Botunuzun Replit URL'si (Sonuna /update-teams ekleyin)
local API_URL = "https://35a7f6b3-89e6-4922-9b47-ec881a1a1367-00-1zk02dw30lim2.pike.replit.dev/update-teams"
local SECRET = "AEK_SECRET_123" -- Bot tarafındakiyle aynı olmalı

-- Takım isimlerini botun beklediği anahtarlarla eşleştirin
local TeamMapping = {
    ["Turk Silahli Kuvvetleri"] = "TSK",
    ["Ordu Generalleri"] = "OG",
    ["Ordu Subaylari"] = "OS",
    ["Deniz Kuvvetleri"] = "DKK",
    ["Kara Kuvvetleri"] = "KKK",
    ["Hava Kuvvetleri"] = "HKK",
    ["Ozel Kuvvetler"] = "OKK",
    ["Jandarma"] = "JGK",
    ["Askeri Inzibat"] = "ASIZ"
}

local function updateActivity()
    local teamCounts = {
        TSK = 0, OG = 0, OS = 0, DKK = 0, KKK = 0, HKK = 0, OKK = 0, JGK = 0, ASIZ = 0
    }
    
    -- Takımları tara ve oyuncu sayılarını al
    for _, team in pairs(Teams:GetTeams()) do
        local key = TeamMapping[team.Name]
        if key then
            teamCounts[key] = #team:GetPlayers()
        end
    end
    
    -- Veriyi bot API'sine gönder
    local payload = {
        teams = teamCounts,
        secret = SECRET
    }
    
    local success, err = pcall(function()
        HttpService:PostAsync(API_URL, HttpService:JSONEncode(payload), Enum.HttpContentType.ApplicationJson)
    end)
    
    if success then
        print("[AEK-Bot] Aktiflik başarıyla güncellendi.")
    else
        warn("[AEK-Bot] Aktiflik güncellenirken hata oluştu: " .. tostring(err))
    end
end

-- Sistemi başlat
while true do
    updateActivity()
    task.wait(60) -- Her 1 dakikada bir güncelle
end
