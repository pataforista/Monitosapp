/**
 * Discovery Service for Wikimedia Commons
 * Filters for CC0 and Public Domain images.
 */

export async function searchWikimedia(query) {
    const endpoint = "https://commons.wikimedia.org/w/api.php";

    // 1. Search for images
    const params = new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrsearch: `filetype:bitmap|drawing ${query}`,
        gsrnamespace: "6", // File namespace
        gsrlimit: "10",
        prop: "imageinfo",
        iiprop: "url|extmetadata",
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
            results.push({
                id: `wm-${page.pageid}`,
                title: metadata.ObjectName ? metadata.ObjectName.value : page.title.replace("File:", ""),
                url: info.url,
                source: "Wikimedia Commons",
                author: metadata.Artist ? metadata.Artist.value.replace(/<[^>]*>/g, "") : "Unknown",
                license: license,
                attribution: metadata.License ? metadata.License.value : license,
                thumb: info.url // In a real app, we'd use a thumb URL
            });
        }
    }

    return results;
}
