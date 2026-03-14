# Track Study

A minimalist, self-hosted web application for tracking study time and activities. Built with a focus on low friction and a simple user interface.

## Features

- Time Tracking: Log study sessions using a real-time timer or through manual entry.
- Activity Management: Create and toggle custom study categories.
- Dashboard: View daily logs and a heatmap showing activity intensity over time.
- Insights: Tracks current and longest streaks, 7-day volume, and activity distribution.
- Data Export: Download all logged data as a CSV file.
- Local Storage: All data is stored locally in a lightweight SQLite database.

## Architecture

- Backend: Python 3, FastAPI, Uvicorn
- Frontend: Vanilla HTML, CSS, JavaScript (No external frameworks)
- Database: SQLite3

## Installation

1. Clone the repository.
2. Ensure you have Python 3 installed.
3. Install the required dependencies:

```bash
pip install -r requirements.txt
```

## Usage

Start the server by running:

```bash
python main.py
```

The application will be available at http://localhost:8000.

### Alternative Startup (macOS/Linux)

You can run the included shell script to start the server using an isolated, lightweight virtual environment:

```bash
chmod +x start.sh
./start.sh
```

## Directory Structure

- main.py: FastAPI server configuration, database schema, and API endpoints.
- requirements.txt: Python package dependencies.
- static/: Frontend application files (index.html, style.css, app.js).
- start.sh: Shell script for environment setup and execution on Unix systems.
