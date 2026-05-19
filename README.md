Here is the README.md translated and tailored for English. You can copy and save this directly into your project's root directory!

🗺️ My Map Album
A lightweight, aesthetically pleasing, and private Web-based map album application. This project allows you to drop pins on a map and upload multiple photos for each location, automatically generating a sleek, horizontally scrollable gallery. It features a strict password protection mechanism: the default "View Mode" is strictly for browsing, while "Edit Mode" (which allows adding/deleting data) can only be accessed with a secret key.

✨ Core Features
📍 Seamless Dual-Engine Support: Switch instantly between the completely free, open-source Leaflet engine and the powerful Google Maps engine by changing just one line in the configuration file.

📸 Multi-Photo Gallery & Hot Reloading: Break the single-photo limit! Append an unlimited number of photos to any existing marker. The popup features an elegant horizontal scroll gallery that updates instantly (hot-reloads) when you add or delete photos—no page refresh required.

🎨 Exquisite Visual Design: Features custom delicate purple teardrop pins, deep burgundy typography, and automatic Marker Clustering that activates when zooming out, ensuring your map remains clean and minimalist from a macro perspective.

🔒 Secure Edit Mode: Dual-layer security. Frontend UI prompts for a secret key to unlock edit capabilities, while backend APIs rigorously validate the password to prevent unauthorized tampering with your memories.

🚀 Effortless Deployment & Automation: Built on FastAPI and a local SQLite database (zero configuration required). Once the server starts, it automatically launches your default browser directly to the app.

📦 Portable Standalone Executable: Natively compatible with PyInstaller. Easily package the entire project into a single .exe (Windows) or .app (Mac) file. Just double-click to run—perfect for sharing with friends and family.

🛠️ Tech Stack
Backend: Python 3, FastAPI, Uvicorn

Database: SQLite (Auto-generated and managed, featuring lossless structural data migration)

Frontend: HTML5, CSS3, Vanilla JavaScript

Map Libraries: Leaflet.js / Google Maps JavaScript API

⚙️ Configuration (config.json)
Before running the application, ensure the config.json file is present in the root directory. This is the control center of your application:

JSON
{
    "map_provider": "leaflet", 
    "google_maps_api_key": "YOUR_GOOGLE_KEY_HERE",
    "edit_password": "mysecretpassword",
    "server": {
        "host": "0.0.0.0",
        "port": 8000,
        "reload": true
    },
    "database": {
        "file_name": "map_photos.db"
    }
}
map_provider: Set to "leaflet" for the free open-source map, or "google" to use Google Maps.

Maps_api_key: If using Google Maps, paste your API key here (ignored if using Leaflet).

edit_password: [CRITICAL] The secret key required to enter Edit Mode and add/delete photos.

reload: Keep as true for development (auto-restarts on code save). If packaging into a standalone executable, the app is smart enough to bypass this to prevent crashes.

🚀 Quick Start (Running from Source)
Install Dependencies
Ensure you have Python 3.8+ installed. Run the following command in your terminal:

Bash
pip install fastapi uvicorn pydantic
Start the Server
Run the following command in your project directory:

Bash
python main.py
💡 Tip: Once the server boots up, it will automatically open http://127.0.0.1:8000 in your default web browser!

💻 Usage Guide
1. Browsing the Album (Default Mode)
Upon opening, the map is locked in 「👁️ 現在: 閲覧モード (View Mode)」. You can zoom around, click on the purple teardrop pins, and scroll through the photo galleries. All data is perfectly safe from accidental deletion.

2. Adding New Locations & Photos
Click the button in the top right corner and enter your edit_password.

Once the button changes to 「✏️ 現在: 編集モード (Edit Mode)」, click anywhere on the map.

A file picker will appear. Select a photo, then follow the prompts to enter a "Location Name" and a "Short Description".

A new pin will instantly drop onto the map!

3. Appending & Deleting
Append Photos: In Edit Mode, click an existing pin and click the purple ➕ 写真を追加 (Add Photo) button. The new photo will instantly appear at the end of the gallery.

Delete Single Photo: In Edit Mode, a red ✖ will hover in the top right corner of every photo. Click it to surgically remove just that image.

Delete Entire Location: Click the red 🗑️ スポット削除 (Delete Location) button to completely wipe the location and all its associated photos from the database.

📦 Packaging into a Standalone App (.exe / .app)
If you want to run the app without a Python environment or share it with others, you can package it using PyInstaller:

Install the packaging tool:

Bash
pip install pyinstaller
Execute the build command (run inside your project directory):

Windows: pyinstaller --onefile --name="MapAlbum" --clean main.py

Mac: pyinstaller --onefile --windowed --name="MapAlbum" --clean main.py

[CRUCIAL STEP] Once finished, look inside the newly generated dist folder for your executable. You MUST copy config.json and map_photos.db into the same folder as the executable for it to run successfully. Double-click to enjoy!
