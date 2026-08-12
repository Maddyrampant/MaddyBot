# MaddyBot

A multi-purpose Telegram assistant with 100+ commands: chat, translation, text tools, math, weather, QR codes, games, reminders, group moderation, and an **autonomous agent** that can search the web, browse pages, call APIs, and (for the owner) run shell commands.

## Features

- **Conversation with memory** — per-user chat history, so the bot remembers the context of your conversation.
- **Long-term memory** — remembers facts about you with semantic search (SQLite + embeddings), rolling conversation summaries, and automatic fact extraction from your chats.
- **Autonomous agent** — `/agent` can plan and execute multi-step tasks using tools (web search, page fetch, headless browser, API calls), plus owner-only tools (shell, files, apps).
- **First-user companion** — the first person to message the bot becomes its parent; the bot introduces itself as a little girl and can be taught facts that it remembers and uses later.
- **100+ commands** — organized into categories.
- **No extra API keys required** for most tools — weather, currency, IP lookup, DNS, WHOIS, memes, cat/dog photos, URL shortener, and geocoding use free public services.
- **QR code generation** — done locally with no external service.
- **Games** — number guessing, rock-paper-scissors, tic-tac-toe, hangman, trivia quiz, word unscramble, memory sequence, and a group counting game.
- **Personal tools** — to-do lists, notes, reminders, custom keyword replies, and birthday tracking.
- **Group moderation** — welcome messages, kick, ban, mute, and a warning system.
- **Works in private chats and groups** — in groups the bot replies when mentioned (`@username`) or when its message is replied to.
- **Media downloads** — `/dl`, `/yt`, `/insta`, and `/mp3` download videos and audio from YouTube, Instagram, TikTok, and 1000+ other sites (via local `yt-dlp` + `ffmpeg`, capped at 45&nbsp;MB).
- **Button menu** — `/start` and `/commands` open an interactive inline-keyboard menu (categories → commands → details) plus a quick Reply Keyboard under the input bar.
- **Visual mode (Telegram Mini App)** — a glassmorphism web UI served by the bot itself: dashboard, streaming chat with Madellin, memory browser, and a searchable command catalog. Opened from the bot menu button or `/webapp`.

## Commands

### General

| Command | Description |
| --- | --- |
| `/start` | Welcome message |
| `/help <command>` | List commands or details for one |
| `/commands` | List all commands |
| `/id` | Your ID and the current chat ID |
| `/me` | Your profile and stats |
| `/about` | About MaddyBot |
| `/stats` | Bot statistics |
| `/version` | Bot version |
| `/ping` | Latency check |
| `/settings` | Show your settings |
| `/status` | Bot and system status |
| `/webapp` | Open the visual web app (Mini App) |
| `/feedback <text>` | Send feedback |
| `/report <text>` | Report an issue |

### AI Assistant

| Command | Description |
| --- | --- |
| `/ask <question>` | Chat with the assistant |
| `/reset` | Clear your chat memory |
| `/remember <fact>` | Save a long-term memory |
| `/memories [count]` | List your saved memories |
| `/forget <id>` | Delete a saved memory by id |
| `/forgetall` | Delete all your memories |
| `/forgetchat` | Reset chat history and summaries |
| `/translate <lang> <text>` | Translate text |
| `/summarize <text>` | Summarize text |
| `/grammar <text>` | Fix grammar and spelling |
| `/rewrite <text>` | Rewrite text more clearly |
| `/tone <tone> <text>` | Rewrite text in a tone (formal, friendly, funny) |
| `/shorten <text>` | Shorten text |
| `/expand <text>` | Expand text into detail |
| `/ideas <topic>` | Brainstorm ideas |
| `/essay <topic>` | Write a short essay |
| `/poem <topic>` | Write a short poem |
| `/story <topic>` | Write a short story |
| `/joke` | Tell a joke |
| `/quote` | Inspiring quote |
| `/motivate` | Motivational message |
| `/fact` | Interesting fact |
| `/trivia` | Trivia question |
| `/riddle` | A riddle |
| `/explain <topic>` | Explain simply |
| `/synonyms <word>` | Synonyms for a word |
| `/antonyms <word>` | Antonyms for a word |
| `/email <topic>` | Draft an email |
| `/plan <goal>` | Create a step-by-step plan |

### Text Tools

| Command | Description |
| --- | --- |
| `/upper <text>` | UPPERCASE text |
| `/lower <text>` | lowercase text |
| `/title <text>` | Title Case text |
| `/reverse <text>` | Reverse text |
| `/count <text>` | Count characters and words |
| `/base64 <text>` | Encode to base64 (`decode <text>` to decode) |
| `/urlencode <text>` | URL-encode text (`decode <text>` to decode) |
| `/md5 <text>` | MD5 hash |
| `/sha256 <text>` | SHA-256 hash |
| `/slug <text>` | Convert to a URL slug |
| `/leet <text>` | Convert to leetspeak |
| `/mock <text>` | Spongebob mock case |
| `/emojify <text>` | Add matching emojis to words |

### Math

| Command | Description |
| --- | --- |
| `/calc <expression>` | Evaluate a math expression |
| `/random <min> <max>` | Random number |
| `/dice <sides>` | Roll a die |
| `/coin` | Flip a coin |
| `/choose <a, b, c>` | Pick one from options |
| `/password <length>` | Generate a strong password |
| `/uuid` | Generate a UUID |
| `/prime <n>` | Check if a number is prime |
| `/fib <n>` | First n Fibonacci numbers |
| `/factorial <n>` | Factorial of n |
| `/convert <value> <from> <to>` | Convert units |

### Date & Time

| Command | Description |
| --- | --- |
| `/now` | Current date and time |
| `/date` | Today's date |
| `/time <zone>` | Time in a timezone (tehran, london, tokyo, ...) |
| `/age <YYYY-MM-DD>` | Calculate age |
| `/countdown <YYYY-MM-DD>` | Days until a date |

### Web

| Command | Description |
| --- | --- |
| `/weather <city>` | Current weather for a city |
| `/currency <amount> <from> <to>` | Exchange rate |
| `/shorturl <url>` | Shorten a URL |
| `/search <query>` | Search the web |
| `/fetch <url>` | Read a web page as text |
| `/browse <url>` | Open a page in a browser and read its text |
| `/qr <text>` | Generate a QR code image |
| `/http <url>` | Check a website's HTTP status |
| `/ip` | Your public IP address |
| `/ipinfo <ip>` | IP address details |
| `/whois <domain>` | WHOIS info for a domain |
| `/dns <host>` | DNS records for a host |
| `/geo <query>` | Geocode a location |

### Media & Downloads

| Command | Description |
| --- | --- |
| `/dl <url>` | Download video/media from YouTube, Instagram, TikTok, and 1000+ sites |
| `/yt <url>` | Download a YouTube video |
| `/insta <url>` | Download from Instagram (post, reel, story) |
| `/mp3 <url>` | Extract the audio (mp3) from a video |

> Downloads are capped at ~45&nbsp;MB (Telegram's 50&nbsp;MB upload limit) and use local `yt-dlp` + `ffmpeg`. Only download content you have the right to use.

### Agent & Dev

| Command | Description |
| --- | --- |
| `/agent <task>` | Autonomous agent: searches, browses and calls APIs to complete a task |
| `/run <command>` | Run a shell command (owner only) |
| `/api <method> <url> [body]` | Call an API (POST/PUT/PATCH/DELETE owner only) |

### Fun

| Command | Description |
| --- | --- |
| `/8ball <question>` | Magic 8-ball answer |
| `/scramble <text>` | Scramble the letters |
| `/cat` | Random cat photo |
| `/dog` | Random dog photo |
| `/meme` | Random meme |
| `/ascii <text>` | ASCII art banner |
| `/horoscope <sign>` | Daily horoscope |
| `/lucky` | Your lucky number |
| `/flip <text>` | Flip text upside down |
| `/slot` | Slot machine |

### Games

| Command | Description |
| --- | --- |
| `/guess <number>` | Guess a number 1-100 |
| `/rps <move>` | Rock-paper-scissors |
| `/ttt <cell 1-9>` | Tic-tac-toe vs the bot |
| `/hangman <letter>` | Hangman word game |
| `/quiz <a|b|c|d>` | Trivia quiz |
| `/word <answer>` | Unscramble the word |
| `/memory <sequence>` | Memory sequence game |
| `/counter start\|stop` | Group counting game |

### HTML5 Games (visual arcade)

Playable inside Telegram with real high-score leaderboards:

| Game | Short name | Description |
| --- | --- | --- |
| 🐍 Snake | `snake` | Eat food, grow longer |
| 🎲 2048 | `twenty48` | Merge tiles to reach 2048 |
| 🏓 Pong | `pong` | Classic Pong vs the AI |
| 🧱 Breakout | `breakout` | Break bricks, clear levels |
| 🃏 Memory Match | `memory` | Find matching pairs |
| 💣 Minesweeper | `mines` | Clear the minefield |
| 🔴 Simon Says | `simon` | Repeat the color sequence |
| 🧩 Tetris | `tetris` | Stack blocks, clear lines |
| 🔨 Whack-a-Mole | `whack` | 30 seconds of mole whacking |
| 🐦 Flappy | `flappy` | Guide the bird through pipes |

- `/games` — list every game as a button; tapping it sends the game, then press **Play**.
- `/game <short name>` — send one game directly.
- `/top <short name>` — show the top-10 high-score table in the chat.
- High scores are verified with the signed Telegram launch URL and stored per user; the
  game overlay shows your rank and the leaderboard after every round.

> **Register the games once with @BotFather** so `sendGame` works. For each short name above,
> run `/newgame` in @BotFather, then repeat `/setuserpic` to give it an image. Games are hosted
> by this bot itself (`/games/<file>` on the WebApp server), so no external hosting is needed —
> the same `WEBAPP_URL` (https) is used for the game URLs.

### Personal

| Command | Description |
| --- | --- |
| `/todo add\|done\|del\|clear` | Manage your task list |
| `/notes add\|del\|clear` | Manage your notes |
| `/remind <minutes> <text>` | Set a reminder |
| `/reminders` | List active reminders |
| `/alias <keyword> = <reply>` | Custom keyword replies |
| `/birthday <YYYY-MM-DD>` | Save or show your birthday |
| `/profile` | Your bot profile |

### Group Admin

| Command | Description |
| --- | --- |
| `/welcome set <text>` | Show or set the group welcome message |
| `/kick` | Kick a user (reply to their message) |
| `/ban` | Ban a user (reply to their message) |
| `/unban` | Unban a user |
| `/mute <minutes>` | Mute a user |
| `/unmute` | Unmute a user |
| `/warn` | Warn a user, 3 warns = kick |
| `/admins` | List group administrators |

### Admin (owner only)

| Command | Description |
| --- | --- |
| `/admin` | Open the admin panel (inline buttons) |
| `/sys` | System status: CPU, RAM, disk, uptime |
| `/log [n]` | Last lines of the bot log |
| `/restart` | Restart the bot (PM2) |

> Owner-only commands check `OWNER_ID`; non-owners get a "permission denied" reply.

## Requirements

- Node.js 18 or newer
- A Telegram bot token from [@BotFather](https://t.me/botfather)
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com)

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Maddyrampant/MaddyBot.git
cd MaddyBot

# 2. Install dependencies
npm install
npx playwright install chromium   # needed only for /browse and the browse tool

# 3. Create your configuration file
cp .env.example .env
# then fill in BOT_TOKEN, GEMINI_API_KEY and OWNER_ID (your Telegram ID, from /id)

# 4. Run the bot
npm start
```

The `.env` file holds your secrets and is not committed to the repository. The runtime data (chat memory, user data) is stored under `data/`, which is also excluded from version control.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `BOT_TOKEN` | Yes | Telegram bot token from @BotFather |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GEMINI_MODEL` | No | Model name (default: `gemini-3.5-flash`) |
| `EMBED_MODEL` | No | Embedding model for memory search (default: `gemini-embedding-001`) |
| `OWNER_ID` | No | Your Telegram user ID. Enables owner-only tools (shell, files, apps) |
| `DB_FILE` | No | SQLite database path (default: `data/maddy.db`) |
| `AGENT_ENABLED` | No | Set to `false` to disable the agent entirely |
| `AGENT_TIMEOUT` | No | Agent request timeout in ms (default `120000`) |
| `BROWSER_TIMEOUT` | No | Headless browser timeout in ms (default `30000`) |
| `MAX_AGENT_ROUNDS` | No | Max tool rounds per agent run (default `5`) |
| `WEBAPP_ENABLED` | No | Set to `false` to disable the web UI (default `true`) |
| `WEBAPP_HOST` | No | Web UI bind address (default `127.0.0.1`) |
| `WEBAPP_PORT` | No | Web UI port (default `8834`) |
| `WEBAPP_URL` | No | Public URL of the web UI, used for the Telegram menu button (default `http://localhost:8834`) |
| `WEBAPP_ALLOW_INSECURE` | No | DEV ONLY: set to `true` to open the web UI in a plain browser without Telegram auth |

## Telegram Mini App (visual mode)

The bot hosts a glassmorphism web UI (Persian, RTL) on `http://<WEBAPP_HOST>:<WEBAPP_PORT>`
using only Node's built-in `http` module — no extra dependencies.

- Telegram **Desktop** can open it directly at `http://localhost:8834`.
- **Mobile** needs an HTTPS URL. Easy option: `cloudflared tunnel --url http://localhost:8834`,
  then set `WEBAPP_URL` to the printed `https://…` address and restart the bot.
- On startup the bot sets its menu button (`type: web_app`) and a curated command list
  via `setChatMenuButton` / `setMyCommands`, so the app opens straight from the chat menu.

The web UI is a single page with four views: **dashboard** (status), **chat** (streaming AI
replies), **memory** (browse/delete long-term memories), and **commands** (searchable catalog).
All API calls are authenticated with Telegram's `initData` (HMAC-SHA256 validation,
24h `auth_date` window).

## The Agent

The `/agent` command runs an autonomous loop. For everyone it exposes safe tools
(web search, page fetch, headless browser, read-only API calls, saving memories).
When `OWNER_ID` is set, the owner additionally gets:

- `/run` and the `shell` tool — execute commands on the host machine
- `read_file` / `write_file` / `list_dir` — file access
- `open_app` — open applications on the host
- `api_call` with POST/PUT/PATCH/DELETE

## Usage in Groups

The bot reads every message in groups but only replies when:

- it is mentioned in the text (for example `@MaddyBot help`), or
- its message is being replied to.

This keeps group chats quiet unless the bot is addressed. Moderation commands require administrator rights in the chat.

## Project Structure

```
├── index.js                 # entry point, registers all modules
├── ecosystem.config.cjs     # PM2 process config
├── src/
│   ├── commands/            # command handlers grouped by category
│   │   ├── core.js          # general and info commands
│   │   ├── ai.js            # assistant and text-generation commands
│   │   ├── text.js          # text manipulation tools
│   │   ├── math.js          # math, units, random
│   │   ├── datetime.js      # date and time commands
│   │   ├── web.js           # weather, network, QR
│   │   ├── fun.js           # fun and media commands
│   │   ├── games.js         # interactive games
│   │   ├── personal.js      # todos, notes, reminders, aliases
│   │   ├── game.js          # HTML5 games: /games, /game, /top, sendGame + scores
│   │   ├── group.js         # group moderation
│   │   ├── agent.js         # /agent, /run, /api, /search, /fetch, /browse
│   │   ├── memory.js        # /remember, /memories, /forget, /status
│   │   └── admin.js         # owner-only admin panel: /admin, /sys, /log, /restart
│   ├── gamecatalog.js      # HTML5 game catalog (short names, files)
│   ├── config.js            # environment configuration
│   ├── ai.js                # Gemini client wrapper (chat + embeddings + streaming)
│   ├── menu.js              # inline-keyboard menu router + reply keyboard
│   ├── webapp.js            # web UI server: static files + JSON API + initData auth
│   ├── agent.js             # autonomous tool-calling loop
│   ├── tools.js             # agent tool registry (web, shell, files, APIs)
│   ├── db.js                # SQLite database (better-sqlite3)
│   ├── memory.js            # long-term memory: semantic search, summaries, facts
│   ├── store.js             # JSON data store for users and chats
│   ├── http.js              # HTTP helpers with timeouts
│   ├── utils.js             # shared helpers and command registry
│   ├── games.js             # in-memory game sessions
│   └── scheduler.js         # background reminders loop
├── public/                  # Mini App frontend (served by src/webapp.js)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── games/                   # self-contained HTML5 games (served at /games/*)
│   ├── sdk.js               # shared SDK: auth + score submission + leaderboard
│   ├── snake.html, tetris.html, twenty48.html, ...
└── data/                    # runtime data (created at runtime, ignored by git)
```

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you would like to change.

## License

[MIT](LICENSE)


