# Quick Start Guide

## 5-Minute Setup

1. Install dependencies:
   ```bash
   npm install && cd client && npm install && cd ..
   ```

2. Set your admin password:
   ```bash
   echo "ADMIN_PASSWORD=MyPassword123!" >> .env
   echo "ALLOWED_PROJECT_ROOTS=$HOME/projects" >> .env
   echo "ALLOWED_FILE_ROOTS=$HOME/projects" >> .env
   ```

3. Start:
   ```bash
   npm run dev
   ```

4. Login at http://localhost:3000
   - Username: `admin`
   - Password: `MyPassword123!`

That's it! You're ready to create Claude sessions.

## Next Steps

- Read [README.md](./README.md) for full documentation
- Configure HTTPS for production
- Set up ngrok for remote access (optional)
