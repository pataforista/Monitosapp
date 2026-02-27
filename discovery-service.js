/**
 * Discovery Service for Wikimedia Commons
 * Filters for CC0 and Public Domain images.
 */

export async function searchWikimedia(query) {
    const endpoint = "https://commons.wikimedia.org/w/api.php";

    // 1. Search for images — request thumburl directly so we get a stable
    //    upload.wikimedia.org URL instead of a thumb.php redirect (CORB-safe).
    const params = new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrsearch: `filetype:bitmap|drawing ${query}`,
        gsrnamespace: "6", // File namespace
        gsrlimit: "10",
        prop: "imageinfo",
        iiprop: "url|extmetadata",
        iiurlwidth: "600",  // makes Wikimedia return info.thumburl on upload.wikimedia.org
        origin: "*"
    });

    const response = await fetch(`${endpoint}?${params.toString()}`);
    const data = await response.json();

    if (!data.query || !data.query.pages) {
        return [];
    }

    const pages = Object.values(data.query.pages);
    const results = [];

    for (const page of pages) {
        const info = page.imageinfo ? page.imageinfo[0] : null;
        if (!info) continue;

        const metadata = info.extmetadata;
        const license = metadata.LicenseShortName ? metadata.LicenseShortName.value : "Unknown";

        // Legal filter: CC0, Public Domain, PD
        const isLegal = /CC0|Public Domain|PD/i.test(license);

        if (isLegal) {
            const fileName = page.title.replace("File:", "");
            // thumburl is a direct upload.wikimedia.org URL — no redirect, CORB-safe.
            const directUrl = info.thumburl || info.url;
            results.push({
                id: `wm-${page.pageid}`,
                title: metadata.ObjectName ? metadata.ObjectName.value : fileName,
                url: directUrl,
                source: "Wikimedia Commons",
                author: metadata.Artist ? metadata.Artist.value.replace(/<[^>]*>/g, "") : "Unknown",
                license: license,
                attribution: metadata.License ? metadata.License.value : license,
                thumb: directUrl
            });
        }
    }

    return results;
}

export async function fetchCategoryMonkeys(categoryName = "Monkeys") {
    const endpoint = "https://commons.wikimedia.org/w/api.php";

    // 1. Fetch category members
    const params = new URLSearchParams({
        action: "query",
        format: "json",
        list: "categorymembers",
        cmtitle: `Category:${categoryName}`,
        cmlimit: "50", // Higher than 10 to give variety but keep it fast
        cmtype: "file",
        origin: "*"
    });

    const response = await fetch(`${endpoint}?${params.toString()}`);
    const data = await response.json();

    if (!data.query || !data.query.categorymembers) {
        return [];
    }

    const members = data.query.categorymembers;

    // 2. Fetch detailed info for these members (to get URLs, authors, licenses).
    //    iiurlwidth makes Wikimedia return thumburl on upload.wikimedia.org (CORB-safe).
    const titles = members.map(m => m.title).join("|");
    const infoParams = new URLSearchParams({
        action: "query",
        format: "json",
        prop: "imageinfo",
        iiprop: "url|extmetadata",
        iiurlwidth: "600",  // ensures we get a direct upload.wikimedia.org thumburl
        titles: titles,
        origin: "*"
    });

    const infoResponse = await fetch(`${endpoint}?${infoParams.toString()}`);
    const infoData = await infoResponse.json();

    if (!infoData.query || !infoData.query.pages) {
        return [];
    }

    const pages = Object.values(infoData.query.pages);
    const results = [];

    for (const page of pages) {
        const info = page.imageinfo ? page.imageinfo[0] : null;
        if (!info) continue;

        const metadata = info.extmetadata;
        const license = metadata.LicenseShortName ? metadata.LicenseShortName.value : "Unknown";

        // Strict legal filter: CC0, Public Domain, PD only
        const isLegal = /CC0|Public Domain|PD/i.test(license);
        if (!isLegal) continue;

        const fileName = page.title.replace("File:", "");
        // thumburl is a direct upload.wikimedia.org URL — no redirect, CORB-safe.
        const directUrl = info.thumburl || info.url;
        results.push({
            id: `wm-cat-${page.pageid}`,
            title: metadata.ObjectName ? metadata.ObjectName.value : fileName,
            url: directUrl,
            source: "Wikimedia Commons (Categoría: " + categoryName + ")",
            author: metadata.Artist ? metadata.Artist.value.replace(/<[^>]*>/g, "") : "Unknown",
            license: license,
            attribution: metadata.License ? metadata.License.value : license,
            thumb: directUrl
        });
    }

    return results;
}
