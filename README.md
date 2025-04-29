# MusicSync

A real-time collaborative music listening web application that allows users to share their device audio and microphone in virtual rooms.

## Features

- Create and join virtual rooms for shared music listening
- Real-time audio streaming with WebRTC
- Beautiful audio visualization
- Modern, futuristic UI design
- No account required - just enter a username and start sharing

## Prerequisites

- Node.js 14.0 or later
- npm 6.0 or later
- A modern web browser that supports WebRTC and the Web Audio API

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/musicsync.git
cd musicsync
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The application will be available at `http://localhost:3000`.

## Usage

1. **Creating a Room**
   - Click "Create Room" on the home page
   - Enter a room name and your username
   - Optionally set a password for private rooms (Todo)

2. **Joining a Room**
   - Browse available live rooms on the home page
   - Click "Join" on any room
   - Enter the password if required (Todo)

3. **Sharing Audio**
   - In a room, click "Share Audio"
   - Select the audio source from your device
   - Your audio will be streamed to all room participants

## Technical Notes

- Audio sharing requires browser permission to capture system audio
- For best performance, use Chrome or Edge browsers
- Audio sharing capabilities may vary by operating system

## Browser Support

- Chrome 74+
- Edge 79+
- Firefox 75+
- Safari 13+

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
