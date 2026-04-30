/* =============================================
   KONE EQUIPMENT STATUS API – INTEGRATION
   =============================================
   Dokumentation: https://dev.kone.com/api-portal
   API version: v2

   OPSÆTNING:
   1. Udfyld KONE_CLIENT_ID og KONE_CLIENT_SECRET
      med dine credentials fra KONE Developer Portal
   2. Udfyld KONE_EQUIPMENT_IDS med dine elevatorer
      (find dem i dit KONE dashboard – format: "ken:XXXXXXXXX")
   3. Sæt KONE_USE_SANDBOX = true mens du tester

   ADVARSEL: Til et rigtigt produktionsprojekt må
   credentials IKKE ligge i frontend-kode. Se README.
============================================= */

const KONE_CONFIG = {
  CLIENT_ID:     1d2adf95-17dd-4170-b061-f1f67fbe5a6a,
  CLIENT_SECRET: 8148c10a977020f28cb92b1d66254f1056292a005e24a7e4bfe6b040e15ae1e6,  
  
  // Sæt til false når du går live med rigtige data
  USE_SANDBOX: true,

  // Base URL – KONE bruger samme URL for sandbox og produktion,
  // sandbox-data styres via hvilke equipment IDs du har adgang til
  BASE_URL: 'https://dev.kone.com',

  // Dine elevator-IDs fra KONE dashboard (format: "ken:XXXXXXXXX")
  // Tilføj alle de elevatorer du vil overvåge her
  EQUIPMENT_IDS: [
    // 'ken:100554477',
    // 'ken:100554478',
    // 'ken:100554479',
  ]
};

/* =============================================
   TOKEN HÅNDTERING
   Token udløber efter 3600 sekunder (1 time)
   Vi cacher det så vi ikke henter et nyt ved hvert kald
============================================= */
let _tokenCache = {
  token: null,
  expiresAt: null
};

async function getAccessToken() {
  // Brug cached token hvis det stadig er gyldigt (med 60 sek. buffer)
  if (_tokenCache.token && _tokenCache.expiresAt > Date.now() + 60000) {
    return _tokenCache.token;
  }

  // Lav Basic auth header: base64(clientId:clientSecret)
  const credentials = btoa(`${KONE_CONFIG.CLIENT_ID}:${KONE_CONFIG.CLIENT_SECRET}`);

  const response = await fetch(`${KONE_CONFIG.BASE_URL}/api/v2/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials&scope=application/inventory'
  });

  if (!response.ok) {
    throw new Error(`KONE auth fejlede: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  _tokenCache.token = data.access_token;
  _tokenCache.expiresAt = Date.now() + (data.expires_in * 1000);

  return _tokenCache.token;
}

/* =============================================
   HENT ELEVATOR STATUS
   Returnerer et array af elevator-objekter
   klar til at blive brugt i elevatorData
============================================= */
async function fetchKoneElevatorStatus() {
  if (KONE_CONFIG.EQUIPMENT_IDS.length === 0) {
    console.warn('KONE API: Ingen equipment IDs konfigureret i KONE_CONFIG.EQUIPMENT_IDS');
    return [];
  }

  const token = await getAccessToken();

  const response = await fetch(`${KONE_CONFIG.BASE_URL}/api/v2/equipment/search/status`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      equipmentIds: KONE_CONFIG.EQUIPMENT_IDS
    })
  });

  if (!response.ok) {
    throw new Error(`KONE status-kald fejlede: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.map(mapKoneToElevatorData);
}

/* =============================================
   KORTLÆG KONE DATA → VORES FORMAT
   Oversætter KONE's API-svar til det format
   som index.html forventer
============================================= */
function mapKoneToElevatorData(koneItem) {
  const isDown = koneItem.status === 'out' || koneItem.outOfOrder === true;

  // Byg en læsbar stationsnavn fra lokationsdata
  const station = koneItem.equipmentLocationDescription
    || koneItem.equipmentFunctionalLocationDescription
    || koneItem.addressCity
    || koneItem.equipmentId;

  // Byg en lokationsbeskrivelse
  const location = [
    koneItem.addressStreet,
    koneItem.customerEquipmentLocationId
  ].filter(Boolean).join(' – ') || 'KONE elevator';

  // Reparationsdato (hvis udstyret er kommet tilbage i drift)
  const etaRepair = koneItem.equipmentBackInOrderDate
    ? koneItem.equipmentBackInOrderDate.split('T')[0]
    : null;

  // Note baseret på vedligeholdelsesstatus
  let note = null;
  if (koneItem.maintenance?.status) {
    note = `Vedligeholdelse: ${koneItem.maintenance.status}`;
  }
  if (koneItem.entrapment) {
    note = '🚨 Obs: Person indespærret rapporteret – kontakt straks driftscentral';
  }

  return {
    id: koneItem.equipmentId,
    station: station,
    location: location,
    status: isDown ? 'down' : 'ok',
    etaRepair: etaRepair,
    note: note,
    isUserReport: false,
    reportedAt: koneItem.equipmentOutOfOrderDate
      ? koneItem.equipmentOutOfOrderDate.split('T')[0]
      : null,
    // Gem rådata fra KONE i tilfælde af det skal bruges
    _koneRaw: koneItem
  };
}

/* =============================================
   SYNKRONISÉR MED SIDEN
   Denne funktion kaldes fra index.html.
   Den henter data fra KONE og opdaterer
   elevatorData-arrayet på siden.
============================================= */
async function syncKoneData() {
  const statusEl = document.getElementById('kone-sync-status');

  try {
    if (statusEl) {
      statusEl.textContent = '🔄 Henter data fra KONE...';
      statusEl.style.color = 'var(--color-text-muted)';
    }

    const koneElevatorer = await fetchKoneElevatorStatus();

    if (koneElevatorer.length === 0) {
      if (statusEl) {
        statusEl.textContent = '⚠️ Ingen KONE-data (tjek equipment IDs)';
        statusEl.style.color = 'var(--color-warning)';
      }
      return;
    }

    // Erstat eller tilføj KONE-elevatorer i det globale elevatorData array
    // (bevarer manuelt indtastede elevatorer fra admin-panelet)
    koneElevatorer.forEach(koneElev => {
      const existingIndex = elevatorData.findIndex(e => e.id === koneElev.id);
      if (existingIndex >= 0) {
        // Opdatér eksisterende
        elevatorData[existingIndex] = koneElev;
      } else {
        // Tilføj ny
        elevatorData.push(koneElev);
      }
    });

    saveData();
    renderElevatorGrid();

    const sidstOpdateret = new Date().toLocaleTimeString('da-DK');
    if (statusEl) {
      statusEl.textContent = `✅ Sidst opdateret fra KONE: ${sidstOpdateret}`;
      statusEl.style.color = 'var(--color-success)';
    }

    console.log(`KONE sync: ${koneElevatorer.length} elevatorer hentet`);

  } catch (error) {
    console.error('KONE API fejl:', error);
    if (statusEl) {
      statusEl.textContent = `❌ KONE API fejl: ${error.message}`;
      statusEl.style.color = 'var(--color-danger)';
    }
  }
}

/* =============================================
   AUTO-OPDATERING
   Henter nye data fra KONE hvert 5. minut
   så siden altid er opdateret
============================================= */
function startKoneAutoSync(intervalMinutter = 5) {
  // Første hentning med det samme
  syncKoneData();
  // Derefter hvert X minut
  setInterval(syncKoneData, intervalMinutter * 60 * 1000);
  console.log(`KONE auto-sync startet (opdaterer hvert ${intervalMinutter}. minut)`);
}
