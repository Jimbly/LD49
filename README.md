LD49 - Unstable
============================

Ludum Dare 49 Entry by Jimbly - "Blood of Beasts"

* Play here: [http://www.dashingstrike.com/LudumDare/LD49/](dashingstrike.com/LudumDare/LD49/)
* Using [Javascript libGlov/GLOV.js framework](https://github.com/Jimbly/glovjs)

Start with: `npm start` (after running `npm i` once)

Brainstorm

Explore Elite Dangerous Ore Refinery mechanic

You are a hunter of strange magical beasts, distilling their volatile essence into valuable crystals.
Equipment:
  Essence Refinery - starts with 3 slots (2 slots?), upgradable to 4 or 5
  Diviner - 1-N uses, improves the information you get at Choice #1


Choice #1 - Kick down a door
  Where to explore?  Presented with 3 options, and optionally Diviner results
    Similar options should have a chance of yielding similar prey (80%?)

Battle ensues (offscreen?  need something simple to feel engaging?)

Choice #2 - Distillation
  Beast is slain, if any of its essence types do not fit, empty current vials until all is consumed; Also, need to be able to empty vials anyway, if they are unstable!
    Stretch: different levels of each essence, can choose to dilute by combining higher and lower level to lower
  Add Undo / reset to start of phase here, easy to make mistakes!  Or, just make it harder to make mistakes / more clear.

Expiration counts down on vials, possibly exploding and causing great damage

Choice #3 - Rest & Upgrade
  Inn to heal
  Exports to sell completed crystals
  Refiner's Guild to upgrade
  Diviner's Guild to hire for the next trek(s)
  Venture Fo[u]rth

Goal / end?
  Simplest: monetary goal
  Stretch: acquire 1 of each L5 crystal or something - something that pushes you to deal with the instability

Resources:
  Relgast - heal
  Yendar - valuable
  Groalac - upgrade L2
  Cystil - upgrade
  Blazinul - stable
  Mahite - unlock L2 essence

TODO:
  Change more (all after any menu?) things to be new/fresh screens, e.g. intro text from refiner's guild should show text, and have a "continue" stop.
  Alliterize everything
  Some correlation between location, beast, and essence drops
