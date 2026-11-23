# Who's watching on LG and Samsung TV

A fresh app launch asks who's watching while leaving the TV linked to Arc.
Resuming the open TV app keeps the selected profile. The browser preview also
keeps it on reload. A single already selected, unlocked profile and a friend's
own sign-in keep their existing behavior.

Settings → This TV adds **Sign in automatically**. It remembers one profile in
localStorage for this device. Signing out or changing server clears the choice.
A deleted or PIN-protected saved profile goes to the picker. The setting shows
Off and is disabled for a protected profile.

Arc follows the web design in server #505. Plex documents automatic entry for
Plex Home, including PIN bypass in its Android TV client. Arc still requires PIN
entry. The exact Plex LG/Samsung client behavior was not verified.
[Plex Android TV settings](https://support.plex.tv/articles/settings-android-tv/)

`npm run check` passed TypeScript, 38 checks, both TV builds and legacy bundle
syntax. Pinned Chromium with local fixtures passed the launch, reload, visibility
event, automatic selection, PIN, deleted profile, sign-out and single-profile
paths. Remote Enter and Down reached the setting and its explanation.
[Screenshots](2026-11-22-launch-picker/)

No physical LG or Samsung TV, packaged app or OS-level background/resume was
tested. An existing Home hook error appeared with an empty fixture library.
The focused sign-in walk used a populated fixture.

Arc logs opening the picker or automatically signing in at info. A refused
automatic selection logs the HTTP status. No name, profile ID or token is logged.
