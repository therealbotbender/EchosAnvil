# Deployment Context

## Current Production Setup

This bot is deployed using:
- **Container Platform**: Docker
- **Orchestration**: Portainer (Web UI)
- **Deployment Method**: Stacks (docker-compose format)
- **Host Environment**: Proxmox (likely)
- **OS**: Linux (containerized)

## Important Considerations for Future Development

### When adding new features or configuration:
1. **Prefer environment variables over files**
   - Easier to manage in Portainer UI
   - No need to mount volumes or upload files to server
   - Example: `YOUTUBE_COOKIES` env var instead of cookies.txt file

2. **Document in portainer-stack.yml**
   - All config should be visible in the stack file
   - Use comments to explain optional settings
   - Provide examples in the stack template

3. **Provide both methods when possible**
   - Environment variable (primary - easiest for Portainer)
   - File mount (alternative - for advanced users)
   - Example: Cookie support via env var OR file mount

4. **Update these docs when adding configuration**
   - `portainer-stack.yml` - Stack template with examples
   - `docs/portainer-deployment.md` - Portainer-specific guide
   - `.env.example` - Local dev environment template
   - `README.md` - Main setup instructions

### File Persistence
- Database and persistent data stored in Docker volumes
- Volume: `echosanvil-data` mounted to `/app/data`
- Survives container restarts and updates

### Auto-Updates
- Watchtower enabled for automatic updates
- Checks for new images every 5 minutes (configurable)
- Pulls and restarts container automatically when new version available

### Resource Limits
Current limits (configurable in stack):
- CPU: 1 core limit, 0.5 core reservation
- Memory: 512MB limit, 256MB reservation

## Deployment Workflow

1. **Code Changes** → Push to GitHub
2. **Build Image** → Rebuild Docker image
3. **Push Image** → Push to container registry
4. **Auto-Deploy** → Watchtower detects and updates automatically
   - OR manually update via Portainer UI

## Access Points

- **Portainer UI**: Web interface for managing containers/stacks
- **Proxmox Shell**: Direct host access for troubleshooting
- **Container Logs**: Available in Portainer → Containers → Logs
- **Container Console**: Available in Portainer → Containers → Console

## Future Ideas

- Consider Portainer secrets for sensitive data (requires Business edition)
- Could add health checks for better monitoring
- Consider log aggregation for production monitoring
- Could add backup automation for database volume

---

*Last Updated: 2025-12-28*
