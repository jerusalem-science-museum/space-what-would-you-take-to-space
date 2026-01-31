simple flask based app to cast a vote on what you want to take w you to space.
### setup:
```bash
sudo apt update
sudo apt install chromium
sudo crontab -e
# add to the end - daily reboot to counteract possible hang after 24h of browser.
0 9 * * * /usr/sbin/reboot
# save, exit.
```
then add to startup applications a process that runs the poll:
`/home/mada/Documents/what-would-you-take-to-space/run_app.sh`
### setup touchscreen
rotate screen to be in portrait (in display settings). if touch is screwed up:
```bash
xrandr --query | grep HDMI # find the hdmi connection that says connected, e.g.:
# HDMI2 connected primary 1080x1920+0+0 right (normal left inverted right x axis y axis) 940mm x 530mm
xinput list # find the name of the touchscreen
# update name of touchscreen/display names in fix_touch.sh
# e.g. xinput map-to-output "USBest Technology SiS HID Touch Controller" HDMI2
crontab -e
# add to the end - fix the touch for the touchscreen. 
* * * * * DISPLAY=:0 /home/mada/Documents/fix_touch.sh >> ~/touchmap.log
# save, exit.
```
if touch works fine, yay.
