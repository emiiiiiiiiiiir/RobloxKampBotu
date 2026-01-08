# Roblox Askeri Kamp Discord Botu

## Overview
A Discord bot designed to manage Roblox military camp groups. It integrates Discord with Roblox's API for rank management, game moderation, and automatic account syncing via RoWifi.

## Project Architecture
- Discord.js v14 bot
- Roblox API integration (src/roblox.js)
- RoWifi integration for automatic account linking
- JSON-based storage for local data

## Recent Changes (2026-01-08)
- Removed manual account linking (`/roblox-bağla`, `/roblox-değiştir`).
- Simplified `/yenile` command to automatically sync with RoWifi.
- Updated `checkAccountSync` for automatic RoWifi discovery.
- Cleaned up obsolete command handlers.

## User Preferences
Preferred communication style: Simple, everyday language.

## External Dependencies
- `discord.js` (^14.23.2)
- `axios` (^1.12.2)
- RoWifi API v2
