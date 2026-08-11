# MaddyBot

A multi-purpose Telegram assistant with 100+ commands: chat, translation, text tools, math, weather, QR codes, games, reminders, and group moderation.

## Features

- **Conversation with memory** — per-user chat history, so the bot remembers the context of your conversation.
- **First-user companion** — the first person to message the bot becomes its parent; the bot introduces itself as a little girl and can be taught facts that it remembers and uses later.
- **100+ commands** — organized into ten categories.
- **No extra API keys required** for most tools — weather, currency, IP lookup, DNS, WHOIS, memes, cat/dog photos, URL shortener, and geocoding use free public services.
- **QR code generation** — done locally with no external service.
- **Games** — number guessing, rock-paper-scissors, tic-tac-toe, hangman, trivia quiz, word unscramble, memory sequence, and a group counting game.
- **Personal tools** — to-do lists, notes, reminders, custom keyword replies, and birthday tracking.
- **Group moderation** — welcome messages, kick, ban, mute, and a warning system.
- **Works in private chats and groups** — in groups the bot replies when mentioned (`@username`) or when its message is replied to.

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
| `/feedback <text>` | Send feedback |
| `/report <text>` | Report an issue |

### AI Assistant

| Command | Description |
| --- | --- |
| `/ask <question>` | Chat with the assistant |
| `/reset` | Clear your chat memory |
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
| `/shorten <url>` | Shorten a URL |
| `/qr <text>` | Generate a QR code image |
| `/http <url>` | Check a website's HTTP status |
| `/ip` | Your public IP address |
| `/ipinfo <ip>` | IP address details |
| `/whois <domain>` | WHOIS info for a domain |
| `/dns <host>` | DNS records for a host |
| `/geo <query>` | Geocode a location |

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

# 3. Create your configuration file
cp .env.example .env
# then fill in BOT_TOKEN and GEMINI_API_KEY

# 4. Run the bot
npm start
```

The `.env` file holds your secrets and is not committed to the repository. The runtime data (chat memory, user data) is stored under `data/`, which is also excluded from version control.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `BOT_TOKEN` | Yes | Telegram bot token from @BotFather |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GEMINI_MODEL` | No | Model name (default: `gemini-2.0-flash`) |
| `OWNER_ID` | No | Your Telegram user ID, always treated as admin in groups |

## Usage in Groups

The bot reads every message in groups but only replies when:

- it is mentioned in the text (for example `@MaddyBot help`), or
- its message is being replied to.

This keeps group chats quiet unless the bot is addressed. Moderation commands require administrator rights in the chat.

## Project Structure

```
├── index.js                 # entry point, registers all modules
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
│   │   └── group.js         # group moderation
│   ├── config.js            # environment configuration
│   ├── ai.js                # Gemini client wrapper
│   ├── store.js             # JSON data store for users and chats
│   ├── memory.js            # per-user chat memory
│   ├── http.js              # HTTP helpers with timeouts
│   ├── utils.js             # shared helpers and command registry
│   ├── games.js             # in-memory game sessions
│   └── scheduler.js         # background reminders loop
└── data/                    # runtime data (created at runtime, ignored by git)
```

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you would like to change.

## License

[MIT](LICENSE)


