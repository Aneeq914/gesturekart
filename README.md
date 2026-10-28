# GestureKart

A 3D traffic-rule training game you drive with your body: lean to change lanes, raise a hand to stop at red lights.

- **Live demo:** <VERCEL_LINK>
- **Demo video:** <LINK>

## About

Traffic safety campaigns in Pakistan mostly rely on static rules and lectures, and they fail to engage young drivers, so the rules rarely turn into real driving discipline. GestureKart turns those rules into a short webcam game: you drive down a city road using physical gestures, every traffic violation is logged, and at the end you get a downloadable "Civic Driving Score Card".

## Features

- **Webcam gesture control** with MediaPipe Pose: lean left or right to change lanes, raise a hand above your head to brake and stop.
- **Keyboard fallback** if you have no webcam or the camera is blocked.
- **3D road** with traffic lights you must stop at when they are red, and cars blocking your lane that you must dodge.
- **75-second rounds** with a live score and timer.
- **Downloadable PDF "Civic Driving Score Card"** at the end of each round, with your score, grade and a list of every event.

## How to play

Stand or sit back so the webcam can see your head, shoulders and hands. Drive, stop at every red light, and change lanes to avoid cars in your way.

### Controls

| Gesture (webcam)               | Keyboard              | Action               |
| ------------------------------ | --------------------- | -------------------- |
| Lean your body to the left     | `←` or `A`            | Move one lane left   |
| Lean your body to the right    | `→` or `D`            | Move one lane right  |
| Raise a hand above your head   | `Space`, `↓` or `S`   | Brake / stop         |

Hold the stop gesture (or key) to brake to a full stop. Let go and the car speeds back up.

### Scoring

All values come from [`src/game/rules.js`](src/game/rules.js).

| Rule              | Value       |
| ----------------- | ----------- |
| Round length      | 75 seconds  |
| Starting score    | 100 points  |

| Event               | When it happens                                          | Points |
| ------------------- | -------------------------------------------------------- | ------ |
| Stopped at red      | You stop before the stop line while the light is red     | +20    |
| Clean lane change   | You dodge a car that was blocking your lane              | +5     |
| Collision           | You hit a car that was blocking your lane                | -30    |
| Red light jumped    | You cross the stop line while the light is red           | -50    |

Not every light turns red. After you stop at a red light it turns green 2.5 seconds later.

### Grades

| Final score   | Grade | Title              |
| ------------- | ----- | ------------------ |
| 160 or more   | A     | Road Champion      |
| 120 to 159    | B     | Responsible Driver |
| 80 to 119     | C     | Needs Practice     |
| Below 80      | D     | Danger on the Road |

## Tech stack

| Tool                                   | Version (package.json) | Used for                              |
| -------------------------------------- | ---------------------- | ------------------------------------- |
| React                                  | ^19.3.1                | UI                                    |
| Vite                                   | ^8.3.5                 | Dev server and build                  |
| Three.js via React Three Fiber         | three ^0.186.1, @react-three/fiber ^9.8.2 | 3D scene               |
| MediaPipe Tasks Vision (Pose Landmarker) | ^1.2.0               | Body tracking from the webcam         |
| zustand                                | ^5.0.16                | Shared game state                     |
| jsPDF + html-to-image                  | jspdf ^4.2.1, html-to-image ^1.11.13 | PDF score card              |
| Vitest                                 | ^5.0.5                 | Unit tests                            |

## Getting started

You need **Node.js 18 or newer** (the project was built with Node 22).

```bash
npm install
npm run dev
```

Then open <http://localhost:5173> and allow camera access when the browser asks.

The browser only allows webcam access on `localhost` or over HTTPS. If you open the dev server from another device using your LAN IP (for example `http://192.168.x.x:5173`), the camera will be blocked. Use the keyboard there, or test on the deployed HTTPS site.

Other commands:

```bash
npm test         # run the unit tests once (Vitest)
npm run build    # production build into dist/
npm run preview  # serve the production build locally
```

## Project structure

```
gesturekart/
├── index.html
├── package.json
├── vite.config.js
├── public/
└── src/
    ├── main.jsx
    ├── App.jsx                 # picks the screen: start, playing (HUD) or game over
    ├── gesture/
    │   ├── classifyPose.js     # pose landmarks -> action (left / right / stop / none), unit-tested
    │   ├── gestureEngine.js    # webcam + MediaPipe PoseLandmarker
    │   └── useControls.js      # combines gestures with the keyboard fallback
    ├── game/
    │   ├── rules.js            # every scoring and timing number
    │   ├── simulation.js       # pure driving logic, unit-tested
    │   └── GameScene.jsx       # React Three Fiber scene + road, car, traffic lights, obstacles, scenery
    ├── components/
    │   ├── StartScreen.jsx
    │   ├── HUD.jsx
    │   ├── GameOver.jsx        # score card + PDF download
    │   ├── CameraPreview.jsx
    │   └── Tooltip.jsx
    ├── store/
    │   └── gameStore.js        # zustand store: phase, score, timer, input, camera status
    └── styles/
        ├── tokens.css
        └── app.css
```

## Deploy to Vercel

1. Push the project to a GitHub repository.
2. In Vercel, click **Add New > Project** and import the repository.
3. Use these settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy. Vercel serves the site over HTTPS, which the webcam needs.

No extra files need to be uploaded. The MediaPipe wasm files and the pose model are downloaded at runtime from the jsDelivr and Google storage CDNs.

## Team roles

Based on the 4-member role matrix in the hackathon brief (§3).

| Member | Role                       | Owns                                                            | Target from the brief                                          |
| ------ | -------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| 1      | CV Lead                    | `src/gesture/`                                                  | Smooth 60 FPS gesture detection with zero input lag            |
| 2      | Game Dev                   | `src/game/`                                                     | Road, obstacles, signals, collisions                           |
| 3      | UI/UX Lead                 | `src/components/`, `src/styles/`                                | Game overlay UI, sound, downloadable PDF score card            |
| 4      | DevOps & Submissions       | Repo setup, Vercel deployment, `README.md`                      | Live Vercel link, repo, demo video, classroom post             |

`src/store/gameStore.js` is shared by everyone. Agree on changes to it before editing.

## Hackathon submission checklist

From the hackathon brief (§4):

- [ ] Live deployed URL on Vercel, Netlify or Render with HTTPS (the webcam requires it)
- [ ] Public GitHub repository with the complete source code, a clear folder structure, setup instructions and a `README.md`
- [ ] Google Classroom submission containing:
  - [ ] Live web app link
  - [ ] GitHub repository URL
  - [ ] 2-minute screen recording or Loom demo showing live gesture control
- [ ] LinkedIn announcement post by team members, showing the video demo and tagging the hackathon organizer

## Troubleshooting

**Camera is blocked or permission was denied.**
Click the camera icon in the browser's address bar, allow camera access for the site, then reload the page. Also close other apps that might be using the webcam (Zoom, Teams, OBS). You can still play with the keyboard.

**"Camera needs HTTPS".**
Browsers only give webcam access on `localhost` or `https://` pages. Open the game at `http://localhost:5173` during development, or use the deployed Vercel link.

**My body is not detected.**
Step back until your head, both shoulders and your hands are in the frame. Face the camera, use good lighting (light in front of you, not behind you), and avoid a cluttered background.

**The game is laggy.**
Close other browser tabs and heavy apps. MediaPipe tries to use the GPU and falls back to the CPU if it can't, which is slower. Make sure hardware acceleration is turned on in your browser settings, and plug in your laptop if it is on battery saver.

**The PDF does not download.**
Check that your browser is not blocking downloads or pop-ups for the site, and try again. If it still fails, try a different browser (Chrome or Edge) and make sure you are not in a restricted or private mode that blocks downloads.
