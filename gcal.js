/* =============================================
   GOOGLE CALENDAR INTEGRATION
   =============================================
   Projekt: TilgængeligRejse
   Google Cloud Client ID er konfigureret nedenfor.

   FUNKTIONER:
   - Logger reparatør ind via Google OAuth
   - Opretter automatisk kalenderbegivenhed når elevator sættes ned
   - Læser rutine-tjek fra kalenderen og viser dem på forsiden
   - Reparatør kan ændre tidspunkt direkte i admin-panelet
============================================= */

const GCAL_CONFIG = {
  CLIENT_ID: '772976968940-8enhdqfum23ebusesvqsb2vmk5s698p6.apps.googleusercontent.com',
  // Scopes vi har brug for: læse + skrive kalender
  SCOPES: 'https://www.googleapis.com/auth/calendar',
  // Navn på den kalender vi opretter/bruger
  CALENDAR_NAME: 'TilgængeligRejse – Reparationer',
  // ID gemmes her når kalenderen er fundet/oprettet
  CALENDAR_ID: null
};

// Token til Google API
let _gcalToken = null;
let _gcalInitialized = false;

/* =============================================
   INDLÆS GOOGLE API (gapi)
   Loades dynamisk så det ikke bremser siden
============================================= */
function loadGoogleAPI() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Kunne ikke indlæse Google API'));
    document.head.appendChild(script);
  });
}

function loadGapiClient() {
  return new Promise((resolve, reject) => {
    if (window.gapi?.client) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      gapi.load('client', {
        callback: resolve,
        onerror: reject
      });
    };
    script.onerror = () => reject(new Error('Kunne ikke indlæse gapi'));
    document.head.appendChild(script);
  });
}

/* =============================================
   LOGIN MED GOOGLE (OAuth 2.0)
   Bruges i admin-panelet så reparatøren
   giver adgang til sin Google Kalender
============================================= */
async function gcalLogin() {
  await Promise.all([loadGoogleAPI(), loadGapiClient()]);

  await gapi.client.init({
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']
  });

  return new Promise((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GCAL_CONFIG.CLIENT_ID,
      scope: GCAL_CONFIG.SCOPES,
      callback: async (response) => {
        if (response.error) {
          reject(new Error(`Google login fejl: ${response.error}`));
          return;
        }
        _gcalToken = response.access_token;
        gapi.client.setToken({ access_token: _gcalToken });
        _gcalInitialized = true;

        // Find eller opret vores kalender
        await findOrCreateCalendar();
        resolve(_gcalToken);
      }
    });
    // Brug 'popup' mode eksplicit for at undgå cross-origin fejl
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

function gcalIsLoggedIn() {
  return _gcalInitialized && _gcalToken !== null;
}

function gcalLogout() {
  if (_gcalToken) {
    google.accounts.oauth2.revoke(_gcalToken);
  }
  _gcalToken = null;
  _gcalInitialized = false;
  GCAL_CONFIG.CALENDAR_ID = null;
}

/* =============================================
   FIND ELLER OPRET KALENDER
   Leder efter "TilgængeligRejse – Reparationer"
   i brugerens Google Kalender – opretter den
   hvis den ikke findes
============================================= */
async function findOrCreateCalendar() {
  const response = await gapi.client.calendar.calendarList.list();
  const calendars = response.result.items || [];

  const existing = calendars.find(c => c.summary === GCAL_CONFIG.CALENDAR_NAME);
  if (existing) {
    GCAL_CONFIG.CALENDAR_ID = existing.id;
    console.log('Google Kalender fundet:', existing.id);
    return existing.id;
  }

  // Opret ny kalender
  const newCal = await gapi.client.calendar.calendars.insert({
    resource: {
      summary: GCAL_CONFIG.CALENDAR_NAME,
      description: 'Automatisk oprettet af TilgængeligRejse til håndtering af elevatorreparationer og rutine-tjek.',
      timeZone: 'Europe/Copenhagen'
    }
  });

  GCAL_CONFIG.CALENDAR_ID = newCal.result.id;
  console.log('Google Kalender oprettet:', newCal.result.id);
  return newCal.result.id;
}

/* =============================================
   OPRET REPARATIONSBEGIVENHED
   Kaldes automatisk når elevator sættes ned.
   Opretter en begivenhed næste hverdag kl. 09:00
   som reparatøren kan ændre bagefter.
============================================= */
async function createRepairEvent(elevator) {
  if (!gcalIsLoggedIn()) {
    console.warn('Google Calendar: ikke logget ind');
    return null;
  }

  const startTime = getNextWeekday(9, 0);  // Næste hverdag kl. 09:00
  const endTime   = getNextWeekday(11, 0); // Slutter kl. 11:00 (estimat)

  const event = {
    summary: `🔴 Elevator nede – ${elevator.station}`,
    description: [
      `Station: ${elevator.station}`,
      `Placering: ${elevator.location || 'Ikke angivet'}`,
      ``,
      `⚠️ OBS: Det er ikke sikkert at problemet kan løses ved dette besøg.`,
      `Manglende reservedele eller ukendt fejl kan betyde at yderligere besøg er nødvendigt.`,
      ``,
      `Oprettet automatisk af TilgængeligRejse.`,
      `Elevator ID: ${elevator.id}`
    ].join('\n'),
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'Europe/Copenhagen'
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'Europe/Copenhagen'
    },
    colorId: '11', // Rød farve i Google Calendar
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 30 }
      ]
    },
    // Gem elevator-ID i extended properties så vi kan finde begivenheden igen
    extendedProperties: {
      private: {
        elevatorId: elevator.id,
        type: 'repair'
      }
    }
  };

  const response = await gapi.client.calendar.events.insert({
    calendarId: GCAL_CONFIG.CALENDAR_ID,
    resource: event
  });

  console.log('Reparationsbegivenhed oprettet:', response.result.htmlLink);
  return response.result;
}

/* =============================================
   OPDATÉR BEGIVENHED
   Kaldes når reparatøren ændrer dato/tid
   i admin-panelet
============================================= */
async function updateRepairEvent(eventId, newStartDate, newStartTime, note) {
  if (!gcalIsLoggedIn()) return null;

  const start = new Date(`${newStartDate}T${newStartTime || '09:00'}:00`);
  const end   = new Date(start.getTime() + 2 * 60 * 60 * 1000); // +2 timer

  const patch = {
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Copenhagen' },
    end:   { dateTime: end.toISOString(),   timeZone: 'Europe/Copenhagen' }
  };

  if (note) {
    patch.description = note + '\n\nOpdateret via TilgængeligRejse admin-panel.';
  }

  const response = await gapi.client.calendar.events.patch({
    calendarId: GCAL_CONFIG.CALENDAR_ID,
    eventId: eventId,
    resource: patch
  });

  return response.result;
}

/* =============================================
   SLET BEGIVENHED
   Kaldes når elevator markeres som repareret
============================================= */
async function deleteRepairEvent(eventId) {
  if (!gcalIsLoggedIn() || !eventId) return;
  try {
    await gapi.client.calendar.events.delete({
      calendarId: GCAL_CONFIG.CALENDAR_ID,
      eventId: eventId
    });
    console.log('Kalenderbegivenhed slettet:', eventId);
  } catch (e) {
    console.warn('Kunne ikke slette kalenderbegivenhed:', e);
  }
}

/* =============================================
   LÆS RUTINE-TJEK FRA KALENDER
   Henter kommende begivenheder markeret
   som rutine-tjek og returnerer dem
   så forsiden kan vise dem
============================================= */
async function fetchRoutineChecks() {
  if (!gcalIsLoggedIn() || !GCAL_CONFIG.CALENDAR_ID) return [];

  const now = new Date();
  const inThreeMonths = new Date();
  inThreeMonths.setMonth(inThreeMonths.getMonth() + 3);

  const response = await gapi.client.calendar.events.list({
    calendarId: GCAL_CONFIG.CALENDAR_ID,
    timeMin: now.toISOString(),
    timeMax: inThreeMonths.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    privateExtendedProperty: 'type=routine'
  });

  return (response.result.items || []).map(event => ({
    id: event.id,
    station: event.extendedProperties?.private?.elevatorId || 'Ukendt',
    title: event.summary,
    date: event.start.dateTime || event.start.date,
    note: event.description || null
  }));
}

/* =============================================
   OPRET RUTINE-TJEK BEGIVENHED
   Kan oprettes manuelt fra admin-panelet.
   Vises på forsiden som planlagt vedligehold.
============================================= */
async function createRoutineCheck(elevator, date, note) {
  if (!gcalIsLoggedIn()) return null;

  const start = new Date(`${date}T08:00:00`);
  const end   = new Date(`${date}T10:00:00`);

  const event = {
    summary: `🔧 Rutine-tjek – ${elevator.station}`,
    description: [
      `Station: ${elevator.station}`,
      `Placering: ${elevator.location || 'Ikke angivet'}`,
      ``,
      `ℹ️ Planlagt rutine-tjek. Elevatoren kan være midlertidigt ude af drift.`,
      note ? `Note: ${note}` : '',
      ``,
      `Oprettet via TilgængeligRejse admin-panel.`
    ].filter(Boolean).join('\n'),
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Copenhagen' },
    end:   { dateTime: end.toISOString(),   timeZone: 'Europe/Copenhagen' },
    colorId: '5', // Gul farve
    extendedProperties: {
      private: {
        elevatorId: elevator.id,
        type: 'routine'
      }
    }
  };

  const response = await gapi.client.calendar.events.insert({
    calendarId: GCAL_CONFIG.CALENDAR_ID,
    resource: event
  });

  return response.result;
}

/* =============================================
   HJÆLPEFUNKTIONER
============================================= */

// Finder næste hverdag (springer weekend over)
function getNextWeekday(hour = 9, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  // Spring lørdag (6) og søndag (0) over
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  date.setHours(hour, minute, 0, 0);
  return date;
}

// Formatér dato pænt til dansk
function formatCalDate(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return d.toLocaleString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });
}