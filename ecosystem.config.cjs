module.exports = {
  apps: [{
    name: 'birdlog',
    script: './server/dist/index.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    time: true,
  }],
};