# SndLatr source code

I (developer of sndlatr) no longer have the time to actively continue developing or maintaining SndLatr.
So SndLatr is now released under the APACHE2 license. So feel free to fork and host your own version, if you like.
Costs for hosting the service on Google App Engine are ~$US 0,001 /user/month,
or within the free quotas if you just need a few users.

Nathan Latka (http://nathanlatka.com/) will take over the existing Chrome Extension item and server infrastructure.

I did not maintain this code for quite while, many things are probably outdated.
I won't be accepting pull requests here, but am happy to link anyones fork who's willing maintain it.


## Project Structure:

### gae/
Server-side Google Appengine Code.
Save your `client_secrets.json` from the API manager of the Google Cloud Console
here.

### client/
Client side code injected by extension into gmail ui.  Build it with `npm install &&
bower install && grunt`. The code in `gae/` is copied to the build output
(`dist/`) and is intended to be depolyed as-is to GAE.

Hosts configuration is in `client/app/scripts/sndlatr/constants\*.js`

### website/
Pure informational website. Build with grunt just like client.

### chrome-extension\* / firefox-addons-\*
Browser extensions for Chrome/Firefox

## local dev
For local development run `dev_appserver.py .` in `gae`, run `grunt server` in
`client` and start Chrome with `client/local_insecure_chrome.sh`.

### client unitt tests
Run `karma start` in `client/` to run tests in watch mode.

### gae tests
Run tests with `./run_tests.py` .
Test setup might need some fixing due to changes in gae / nosegae since I used
it the last time.
