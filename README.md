<img src="docs/screenshots/banner.jpg" alt="Dispatch — New York bikeshare rebalancing" width="880" />

[![Live demo](https://img.shields.io/badge/demo-online-brightgreen)](https://city-bike-sigma.vercel.app/)
![Live GBFS data](https://img.shields.io/badge/Live%20Data-green)
![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![Mapbox](https://img.shields.io/badge/Mapbox-000000?style=flat&logo=mapbox&logoColor=white)

<a href="https://city-bike-sigma.vercel.app/" target="_blank" rel="noopener">
  <img src="docs/screenshots/queue.png" alt="Priority Queue — every station that needs a truck, worst first" width="880" />
</a>

**A live dashboard for New York's bike share. It reads the city's public data and
answers one question: which station should a truck go to next, and is it dropping
bikes off or picking them up?**

> **What's real:** the data feed, the scoring model and the ranked queue all run
> on live data. The truck fleet is simulated, because no operator publishes where
> its vehicles are. [Exactly what's built and what isn't →](#where-this-actually-stands)

---

## The problem

Bike share only works if two things are true at the same time. There's a bike
where you are, and there's an empty dock where you're going. Both fail
constantly, for the same reason: **riders decide where the bikes end up.**

Every weekday morning, thousands of people ride out of the neighbourhoods where
they live and into the neighbourhoods where they work. By 10am the racks uptown
are empty and the racks in midtown are packed solid. Two different people are
now stuck:

- You want a bike. The dock is **empty**, so you walk.
- You want to park. The dock is **full**, so you circle the block hunting for
  space, and you're late.

The fix is boring. A van drives around, picking bikes up where they piled up and
dropping them where they ran out. The industry calls this **rebalancing**.

The hard part was never the driving. It's deciding **where to drive.** New York
has **2,509 stations**, and on a normal afternoon somewhere between **700 and
800 of them** need attention at once. No operator has 750 trucks. Nobody has
ever had 750 trucks.

So the real job is triage. Of the 750 things going wrong right now, which twenty
matter most? That's the question this dashboard exists to answer.

---

## Where the data comes from

Every major bike share system in the world publishes its live status in public,
in a shared format called **GBFS**, the General Bikeshare Feed Specification.
It's the reason your maps app can show you Citi Bike docks without Citi Bike
building anything for it.

It's a set of files sitting on the internet, refreshed every few seconds. Anyone
can read them. No key, no login, no permission.

If you've ever opened the map on citibikenyc.com and tapped a station to see how
many bikes are left, **that's this data.** Same source, same numbers, right down
to the Site ID printed at the bottom of the popup. What's different is the
question being asked. Their map answers *"can I get a bike here?"* for one rider
on one corner. This one tries to answer *"where do I send the truck?"* for the
whole city at once.

For each station, the feed gives you roughly this:

```json
{
  "station_id": "66dc7f02-0aca-11e7-82f6-3863bb44ef7c",
  "name": "Park Ave & E 41 St",
  "lat": 40.751581,
  "lon": -73.97791,
  "capacity": 109,
  "num_bikes_available": 0,
  "num_docks_available": 109,
  "last_reported": 1755374820
}
```

That's the whole thing, repeated 2,509 times.

**And that's the problem.** The feed is completely factual and completely silent
on the only thing that matters. It will tell you a station has zero bikes. It
won't tell you whether that's an emergency or a normal Tuesday. Nothing in it
says *urgent*, or *ignore this one*, or *this has been broken since six this
morning*, or **go here first.**

It's a spreadsheet with 2,509 rows and no sort order.

---

## What this app does with it

Dispatch reads that feed every minute and turns each station into something a
person can act on. The station in the JSON above comes out looking like this:

> **88** &nbsp; **Park Ave & E 41 St** · Manhattan · 109 docks, all of them empty
> *Nobody can rent here.* → **drop 55 bikes**

Same data. Now it's a decision.

Four things happen along the way.

**1. Name the failure.** A station with no bikes and a station with no free docks
are opposite emergencies, and they need opposite trucks. One needs bikes
delivered, the other needs bikes taken away. The feed treats both as ordinary
numbers. The app splits them apart and colours them differently everywhere it
shows them: warm means *nobody can rent*, cool means *nobody can return*.

**2. Score how bad it is, 0 to 100.** Higher is worse. Three things move the
number. **Size**, because a big station failing strands more riders than a small
one. **Freshness**, because a reading from 40 minutes ago deserves less trust
than one from 40 seconds ago. **Duration**, because a station that's been empty
for hours is in worse shape than one that just tipped over.

**3. Draw a line.** At **55 and above**, the board says send a truck. Below that,
a station is drifting but people can still rent and return. Above **70** it's
critical and jumps the queue.

**4. Show the work.** Every score opens into a receipt: the arithmetic, every
number that fed into it, and where each of those numbers came from. There's a
whole page listing every constant in the model, each one tagged **measured**,
**reasoned**, or **guess**.

That last part matters more than it sounds. A dashboard that hands you a
confident number you can't check is asking to be either obeyed blindly or
ignored completely. This one tells you up front that the 55 line is a guess
nobody has validated yet, and that the line isn't really what's limiting you
anyway. Around 750 stations qualify on a normal afternoon. A fleet can finish
maybe sixteen truckloads in a shift. **Capacity is the constraint, not the
threshold.** Moving the line changes the number you report at the end of the
day, not the work that actually gets done.

---

## Where the data lies to you

Public data always sounds cleaner than it is. Everything below turned up by
reading the live numbers and checking them against reality. None of it is
written down in the official documentation.

- **Some stations say they last reported in 1970.** 91 of them have no real
  timestamp. A few publish a placeholder date that's meant to say *"never
  reported"*, but read literally it comes out as decades ago. Those stations
  then rocket to the top of the list looking like emergencies, when the truth is
  that nobody has heard from them at all.

- **Stations disagree with themselves.** 706 of the 2,509 report a bike count
  and a dock count that don't add up to the size they claim to be. A station
  might say it holds 73 bikes, then report 11 bikes and 56 free docks. That's
  67, not 73. So "how full is this?" gets measured against the slots that are
  actually working, not the number on the label. Otherwise a station that's
  physically jammed shows up as half empty.

- **The feed doesn't know what a borough is.** There's no borough field in it at
  all, just a few vague regions and some leftover test entries. Every borough in
  this app is worked out from the station's map coordinates.

- **A truck can't fix everything.** Some stations aren't out of bikes, they're
  broken. Switched off, or the dock hardware itself has failed. Driving a van
  full of bikes there accomplishes nothing, so those get routed to a separate
  maintenance list instead of clogging up the dispatch queue.

- **A dead battery still counts as a bike.** This one can't be fixed from this
  data at all. The feed says how many e-bikes are sitting at a station, but not
  how much charge they have. Citi Bike's own app will tell you a station has
  five e-bikes with 33, 16, 11, 2 and 2 miles of range left, and two of those
  are effectively unusable. This dashboard counts all five as available. So the
  board can call a station healthy when a rider walking up to it would strongly
  disagree.

### One more thing worth being clear about

This covers **Citi Bike only.** It doesn't include private rental shops, and it
doesn't include the dockless scooter and bike companies, which aren't in this
feed and never will be. Citi Bike also doesn't serve Staten Island at all.

The 2,509 stations break down like this: Brooklyn 894, Manhattan 681, Queens
457, Bronx 367, Jersey City 76, Hoboken 34. Two of those six places aren't even
in New York.

---

## The screens

| Screen | What it does | Status |
| --- | --- | --- |
| **Priority Queue** | The ranked board. Every station worth sending a truck to, worst first, with filters, search, and a receipt behind every score. | Live data |
| **Map View** | All 2,509 stations on real geography, coloured by how urgent they are or by how full they are. | Live data |
| **Scoring method** | Every constant in the model, tagged by how much it's worth trusting. | Live data |
| **Fleet Operations** | Trucks grouped by when each one frees up, each matched to a job worth doing. | Real logic, invented trucks |
| **Dispatch History** | Did the trips we sent actually fix anything? | Works, resets on reload |
| **Unverified / Maintenance** | Stations that have gone quiet, and ones that are mechanically broken. | Partly built |
| **Analytics / Zones** | Placeholder screens. | Barely started |

---

## The whole network at once

![All 2,509 stations on the map, coloured by urgency](docs/screenshots/map.jpg)

Every station Citi Bike runs, live. Red is critical, amber needs a truck, green
is fine, grey isn't installed yet. The size of each dot is how many docks the
station has, so a big failure looks big. Click any dot to open that station's
receipt.

You can also flip the colours to show *which way* a station is failing: warm for
out of bikes, cool for out of docks. Do that and the daily tide is obvious at a
glance. Uptown drains, downtown clogs.

---

## Where this actually stands

**Real and working**
- Live polling of the public feed, all 2,509 stations, refreshed every minute
- The full scoring model, with 161 automated tests holding its arithmetic in
  place
- The ranked queue, filters, search, and the score receipts
- The map, on real coordinates
- Composing and sending a dispatch, then measuring whether the station recovered

**Simulated**
- **The trucks.** There are 8 of them, with positions, loads and schedules, and
  all of it is invented. The public feed contains no vehicles at all, because no
  operator publishes them. The matching logic is real. The vehicles it matches
  are not.

**Not built yet**
- Analytics and Zones are placeholders
- Nothing is saved. Dispositions, assignments and dispatch history all reset
  when you reload the page.
- 14 buttons across the app are **deliberately disabled**, each with a tooltip
  explaining what it would have done. They're switched off rather than left
  quietly broken, because a button that does nothing makes you doubt the parts
  that work.

---

## Built with

React, TypeScript, Vite, Tailwind, Zustand and Mapbox GL.

The scoring model sits in one file with no UI code in it
([`src/model/score.ts`](src/model/score.ts)), so a background job can import
exactly the same logic the screen uses. That's on purpose: the history and the
live board can never disagree about what a score means.

---

<p align="center">
  <img src="docs/screenshots/banner-minimal.png" alt="Dispatch — New York bikeshare rebalancing" width="560" />
</p>

<p align="center">
  <sub><em>Station data comes from the operator's public GBFS feed. This is an independent project,
  not affiliated with, endorsed by, or connected to Citi Bike, Lyft, or the NYC Department of Transportation.</em></sub>
</p>
