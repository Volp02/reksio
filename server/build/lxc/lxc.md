
## Setup Vacuula in LXC or other standalone way

We provide an lxc script that can be easily run to set your vacuula server up! The script builds the latest version of vacuula locally to `/srv/vacuula`, adds a user to run vacuula and enables it via a service.

If the script detects that you already have data from a previous version, it will ask if you want to make a backup, we really do recommend that you make a backup.

<i>Tested and works to install on Debian 12, Debian 13</i>

### Installation
- `git clone https://github.com/vacuula/vacuula`
- `./vacuula/build/lxc/lxc-setup.sh`
- `curl localhost:80/api/server` - check if running (if you changed the port, you will need to edit 80)

#### Configure Vacuula
- `vi /etc/vacuula.env`
- see [config options](../../README.md#configure-server) and add to the file based on your needs
```ini
# example, change vacuula server port to 8080
VACUULA_PORT=8080
```
- `sudo systemctl restart vacuula` - restart vacuula

### Updating
<i> assuming the cloned vacuula folder was not removed </i>

- `cd vacuula`
- `git pull`
- `./build/lxc/lxc-setup.sh` - say yes to the backup
- `curl localhost:80/api/server` - check if running (if you changed the port, you will need to edit 80)
