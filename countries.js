/**
 * countries.js - Logic & Edge Cases
 * Processes RAW_COUNTRY_DATA and handles alias/region lookups.
 */

// 1. BROAD REGIONS (Returned by X for some accounts)
const REGION_MAP = {
    "europe": { code: "EU", flag: "🇪🇺", name: "Europe" },
    "european union": { code: "EU", flag: "🇪🇺", name: "European Union" },
    "north america": { code: "NA", flag: "🌎", name: "North America" },
    "south america": { code: "SA", flag: "🌎", name: "South America" },
    "latin america": { code: "SA", flag: "🌎", name: "Latin America" },
    "asia": { code: "AS", flag: "🌏", name: "Asia" },
    "east asia & pacific": { code: "EAP", flag: "🌏", name: "East Asia & Pacific" },
    "east asia": { code: "EA", flag: "🌏", name: "East Asia" },
    "south asia": { code: "SAS", flag: "🌏", name: "South Asia" },
    "southeast asia": { code: "SEA", flag: "🌏", name: "Southeast Asia" },
    "australasia": { code: "OC", flag: "🌏", name: "Australasia" },
    "oceania": { code: "OC", flag: "🌏", name: "Oceania" },
    "middle east": { code: "ME", flag: "🌍", name: "Middle East" },
    "middle east & north africa": { code: "MENA", flag: "🌍", name: "Middle East & North Africa" },
    "sub-saharan africa": { code: "SSA", flag: "🌍", name: "Sub-Saharan Africa" },
    "africa": { code: "AF", flag: "🌍", name: "Africa" },
    "antarctica": { code: "AQ", flag: "❄️", name: "Antarctica" }
};

// 2. COMMON ALIASES (Mapping X's weird names to standard names)
const ALIASES = {
    "usa": "united states",
    "uk": "united kingdom",
    "great britain": "united kingdom",
    "england": "united kingdom",
    "scotland": "united kingdom",
    "wales": "united kingdom",
    "uae": "united arab emirates",
    "south korea": "korea, republic of",
    "north korea": "korea, democratic people's republic of",
    "russia": "russian federation",
    "ivory coast": "côte d'ivoire",
    "vietnam": "viet nam",
    "laos": "lao people's democratic republic",
    "syria": "syrian arab republic",
    "turkey": "turkiye",
    "czechia": "czech republic"
};

// 3. BUILD LOOKUP TABLE (Run once on load)
const COUNTRY_LOOKUP = {};

// A. Add Raw Countries from countries-data.js
if (typeof RAW_COUNTRY_DATA !== 'undefined') {
    RAW_COUNTRY_DATA.forEach(c => {
        const data = {
            code: c.isoCode,
            flag: c.emojiFlag,
            name: c.country
        };

        // Index by Full Name (Lowercased)
        COUNTRY_LOOKUP[c.country.toLowerCase()] = data;

        // FIX: Index by ISO Code (Lowercased) -> "us", "it", "ca"
        COUNTRY_LOOKUP[c.isoCode.toLowerCase()] = data;
    });
}

// B. Add Regions
Object.keys(REGION_MAP).forEach(key => {
    COUNTRY_LOOKUP[key] = REGION_MAP[key];
});

// C. Add Aliases
Object.keys(ALIASES).forEach(alias => {
    const realName = ALIASES[alias];
    if (COUNTRY_LOOKUP[realName]) {
        COUNTRY_LOOKUP[alias] = COUNTRY_LOOKUP[realName];
    }
});

// 4. MAIN FUNCTION
function getFlagData(locationString) {
    if (!locationString) return null;

    // Normalize: lower case, remove double spaces
    const cleanLoc = locationString.trim().toLowerCase().replace(/\s+/g, ' ');

    // 1. Direct Match (Name OR Code)
    if (COUNTRY_LOOKUP[cleanLoc]) {
        return COUNTRY_LOOKUP[cleanLoc];
    }

    // 2. Suffix Match (e.g. "Paris, France")
    for (const knownName in COUNTRY_LOOKUP) {
        if (cleanLoc.endsWith(" " + knownName)) {
            return COUNTRY_LOOKUP[knownName];
        }
    }

    return { code: "UNK", flag: "🌍", name: locationString };
}
