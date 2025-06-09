
module.exports = {
  apps: [
    {
      name: 'notaryflow-app',
      script: 'npm',
      args: 'start',
      instances: 1, // Start with 1 instance; can be 'max' for clustering
      autorestart: true,
      watch: false, // Disable watching for production
      max_memory_restart: '1G', // Optional: Restart if it exceeds memory limit
      env_production: {
        NODE_ENV: 'production',
        PORT: 20617
        // PORT: 3000 // Next.js default is 3000. PM2 can also manage port assignment.
                     // If your apphosting.yaml or environment sets a PORT, Next.js will use it.
      },
    },
  ],
};
