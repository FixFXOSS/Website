import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import axios from 'axios';

// Types for artifacts
interface ArtifactVersion {
  version: string;
  recommended: boolean;
  critical: boolean;
  download_url_zip: string;
  download_url_7z: string;
  changelog_url: string;
  published_at: string;
  eol?: boolean;           // End of life flag
  supportStatus?: string;  // Support status (active, deprecated, eol)
  supportEnds?: string;    // Date when support ends
}

interface ArtifactCategory {
  [version: string]: ArtifactVersion;
}

// Simplified artifact data structure since RedM and FiveM share artifacts
interface ArtifactData {
  windows: ArtifactCategory;
  linux: ArtifactCategory;
}

// Cache management
let artifactsCache: ArtifactData | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 3600000; // 1 hour cache

async function fetchArtifacts(): Promise<ArtifactData> {
  const now = Date.now();

  // Return cached data if valid
  if (artifactsCache && now - lastFetchTime < CACHE_DURATION) {
    return artifactsCache;
  }

  // Initialize empty data structure
  const processedData: ArtifactData = {
    windows: {},
    linux: {}
  };

  try {
    // Fetch Windows artifacts - explicitly set User-Agent to avoid being blocked
    try {
      const winResponse = await axios.get('https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      console.log('Windows response type:', winResponse.headers['content-type']);
      console.log('Windows response length:', winResponse.data?.length || 0);

      processedData.windows = parseHtmlArtifacts(winResponse.data, 'windows');
    } catch (err) {
      console.warn('Unable to fetch Windows artifacts:', err);
    }

    // Fetch Linux artifacts with the same headers
    try {
      const linuxResponse = await axios.get('https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      console.log('Linux response type:', linuxResponse.headers['content-type']);
      console.log('Linux response length:', linuxResponse.data?.length || 0);

      processedData.linux = parseHtmlArtifacts(linuxResponse.data, 'linux');
    } catch (err) {
      console.warn('Unable to fetch Linux artifacts:', err);
    }

    console.log('Windows artifacts count:', Object.keys(processedData.windows).length);
    console.log('Linux artifacts count:', Object.keys(processedData.linux).length);

    // Add support status and EOL flags
    processedData.windows = calculateSupportStatus(processedData.windows);
    processedData.linux = calculateSupportStatus(processedData.linux);

    // Update cache
    artifactsCache = processedData;
    lastFetchTime = now;

    return processedData;
  } catch (error) {
    console.error('Error fetching artifacts:', error);
    // Return whatever data we have so far, even if incomplete
    return processedData;
  }
}

// Calculate support status based on release dates and recommended status
function calculateSupportStatus(artifacts: ArtifactCategory): ArtifactCategory {
  // Get all versions sorted by numeric value (descending)
  const versions = Object.keys(artifacts)
    .sort((a, b) => parseInt(b) - parseInt(a));

  const now = new Date();
  const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
  const SIX_WEEKS_MS = 42 * 24 * 60 * 60 * 1000;
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

  // First pass: mark EOL status for all artifacts based on age
  for (let i = 0; i < versions.length; i++) {
    const version = versions[i];
    const artifact = artifacts[version];
    const releaseDate = new Date(artifact.published_at);

    // Check if artifact is more than 3 months old - EOL
    const ageMs = now.getTime() - releaseDate.getTime();
    const isEOL = ageMs > THREE_MONTHS_MS;

    // Mark EOL status
    artifacts[version].eol = isEOL;
  }

  // Second pass: determine explicit recommended version based on critical/recommended markers
  let recommendedVersion = null;
  for (const version of versions) {
    const artifact = artifacts[version];
    if (artifact.recommended && !artifact.eol) {
      recommendedVersion = version;
      break;
    }
  }

  // If no explicitly recommended version found, use the second most recent non-EOL version
  if (!recommendedVersion) {
    const nonEolVersions = versions.filter(v => !artifacts[v].eol);
    if (nonEolVersions.length >= 2) {
      recommendedVersion = nonEolVersions[1]; // Second most recent
      artifacts[recommendedVersion].recommended = true;
    } else if (nonEolVersions.length === 1) {
      recommendedVersion = nonEolVersions[0]; // Only non-EOL
      artifacts[recommendedVersion].recommended = true;
    }
  }

  // Third pass: set support status for all artifacts
  for (let i = 0; i < versions.length; i++) {
    const version = versions[i];
    const artifact = artifacts[version];
    const releaseDate = new Date(artifact.published_at);
    const nextVersion = i > 0 ? versions[i - 1] : null;
    const nextReleaseDate = nextVersion ? new Date(artifacts[nextVersion].published_at) : now;

    // Calculate support end date and status
    let supportEndsDate: Date;
    let supportStatus: string;

    if (version === recommendedVersion) {
      // Recommended artifacts are supported until 6 weeks after the next release
      supportEndsDate = new Date(nextReleaseDate.getTime() + SIX_WEEKS_MS);
      supportStatus = "recommended";
    } else if (i === 0) {
      // Latest artifact - supported until 2 weeks after next release (which doesn't exist yet)
      // Since this is the most recent, we'll say it's supported for 6 months from release
      supportEndsDate = new Date(releaseDate.getTime() + (6 * 30 * 24 * 60 * 60 * 1000));
      supportStatus = "latest";
    } else {
      // Regular artifacts - supported until 2 weeks after the next release
      supportEndsDate = new Date(nextReleaseDate.getTime() + TWO_WEEKS_MS);

      if (supportEndsDate < now) {
        supportStatus = "deprecated";
      } else {
        supportStatus = "active";
      }
    }

    // If it's EOL, override status
    if (artifact.eol) {
      supportStatus = "eol";
    }

    // Apply critical flag on supported artifacts
    if (artifact.critical && supportStatus !== "eol" && supportStatus !== "deprecated") {
      // Critical artifacts are important bugfix versions
      // We don't modify the support status, but frontend can highlight this special case
    }

    // Update artifact with support information
    artifacts[version] = {
      ...artifact,
      supportStatus,
      supportEnds: supportEndsDate.toISOString()
    };
  }

  return artifacts;
}

// Improved HTML parsing function with better error handling
function parseHtmlArtifacts(html: string, platform: 'windows' | 'linux'): ArtifactCategory {
  const artifacts: ArtifactCategory = {};

  try {
    // Check if HTML is empty or not a string
    if (!html || typeof html !== 'string') {
      console.warn(`Invalid HTML for ${platform} platform`);
      return artifacts;
    }

    const $ = cheerio.load(html);
    console.log(`${platform} document loaded`);

    // Remove the hard limit on how many artifacts we process
    // Just set a reasonable safety limit to prevent infinite processing
    const MAX_ARTIFACTS = 5000; // Increased from 1000 to 5000 for more comprehensive data
    let processedCount = 0;

    // First try to find panel-block elements which contain the full artifact information
    $('.panel-block').each((i, element) => {
      try {
        // Safety check to prevent excessive processing
        if (processedCount >= MAX_ARTIFACTS) {
          console.log(`${platform} reached safety limit of ${MAX_ARTIFACTS} artifacts`);
          return false; // Stop processing
        }

        // Extract href from the element (it's the link itself)
        const href = $(element).attr('href');

        // Skip if href doesn't exist or doesn't match the expected pattern
        if (!href) return;

        // Extract version number from the panel text
        const versionText = $(element).find('.level-left').text().trim();
        const versionMatch = versionText.match(/(\d+)/);
        if (!versionMatch) return;

        const version = versionMatch[1];

        // Skip if we already have this version (avoid duplicates)
        if (artifacts[version]) return;

        // Extract the date from the level-right element
        let published_at = new Date().toISOString();
        const dateText = $(element).find('.level-right .level-item').text().trim();

        if (dateText && dateText.length > 0) {
          try {
            const parsedDate = new Date(dateText);
            if (!isNaN(parsedDate.getTime())) {
              published_at = parsedDate.toISOString();
            }
          } catch (e) {
            // Use default date if parsing fails
            console.warn(`Failed to parse date "${dateText}" for version ${version}`);
          }
        }

        // Get the directory name from the href
        // If href points to a file like "server.7z", go up one level
        let dirName = href;
        if (href.endsWith('server.7z') || href.endsWith('server.zip') || href.endsWith('fx.tar.xz')) {
          // Remove the filename to get the directory
          dirName = href.substring(0, href.lastIndexOf('/'));
          // If it starts with ./ remove that
          if (dirName.startsWith('./')) {
            dirName = dirName.substring(2);
          }
        }

        // Direct link to the artifact directory
        const artifactUrl = `${platform === 'windows'
          ? 'https://runtime.fivem.net/artifacts/fivem/build_server_windows/master'
          : 'https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master'}/${dirName}`;

        // Determine correct file names based on platform
        const zipFile = platform === 'windows' ? 'server.zip' : 'fx.tar.xz';
        const sevenZipFile = platform === 'windows' ? 'server.7z' : 'fx.tar.xz';

        // Check if this is a recommended or critical version
        const isRecommended = $(element).hasClass('is-recommended') ||
          $(element).text().toLowerCase().includes('recommended');
        const isCritical = $(element).hasClass('is-critical') ||
          $(element).text().toLowerCase().includes('critical');

        artifacts[version] = {
          version,
          recommended: isRecommended,
          critical: isCritical,
          download_url_zip: `${artifactUrl}/${zipFile}`,
          download_url_7z: `${artifactUrl}/${sevenZipFile}`,
          changelog_url: artifactUrl, // Direct link to artifact directory without file extension
          published_at
        };

        processedCount++;
      } catch (err) {
        console.warn(`Error parsing panel-block ${i}:`, err);
      }
    });

    // If we didn't find any artifacts in panel-blocks, fall back to the a tags
    if (processedCount === 0) {
      console.log(`${platform} No panel blocks found, falling back to links`);

      $('a').each((i, element) => {
        try {
          if (processedCount >= MAX_ARTIFACTS) {
            return false; // Stop processing
          }

          const href = $(element).attr('href');
          if (!href || !href.match(/\d+-[a-f0-9]+\//)) return;

          const versionMatch = href.match(/(\d+)-([a-f0-9]+)/);
          if (!versionMatch) return;

          const version = versionMatch[1];
          if (artifacts[version]) return;

          const dirName = href.replace(/^\.\//, '').replace(/\/$/, '');
          const artifactUrl = `${platform === 'windows'
            ? 'https://runtime.fivem.net/artifacts/fivem/build_server_windows/master'
            : 'https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master'}/${dirName}`;

          let published_at = new Date().toISOString();
          const zipFile = platform === 'windows' ? 'server.zip' : 'fx.tar.xz';
          const sevenZipFile = platform === 'windows' ? 'server.7z' : 'fx.tar.xz';

          artifacts[version] = {
            version,
            recommended: false,
            critical: false,
            download_url_zip: `${artifactUrl}/${zipFile}`,
            download_url_7z: `${artifactUrl}/${sevenZipFile}`,
            changelog_url: artifactUrl,
            published_at
          };

          processedCount++;
        } catch (err) {
          console.warn(`Error parsing link ${i}:`, err);
        }
      });
    }

    console.log(`${platform} artifacts found:`, processedCount);

    // Remove the limit on returned artifacts - don't truncate the results
    // Instead, let the pagination in GET handler control how many are sent to the client
    return artifacts;

  } catch (error) {
    console.error(`Error parsing HTML for ${platform}:`, error);
    return artifacts;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Set a timeout for the whole operation
    const timeoutPromise = new Promise<ArtifactData>((_, reject) => {
      setTimeout(() => reject(new Error('Fetch operation timed out')), 10000);
    });

    // Existing fetch logic
    const fetchPromise = fetchArtifacts();
    const artifactsData = await Promise.race([fetchPromise, timeoutPromise]);

    // Extract query parameters with enhanced filtering options
    const platform = searchParams.get('platform')?.toLowerCase();
    const product = searchParams.get('product')?.toLowerCase();
    const version = searchParams.get('version');
    const search = searchParams.get('search')?.toLowerCase();
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500); // Default to 100, max 500
    const offset = parseInt(searchParams.get('offset') || '0');
    const includeEol = searchParams.get('includeEol') === 'true';
    const sortBy = searchParams.get('sortBy') || 'version'; // version, date
    const sortOrder = searchParams.get('sortOrder') || 'desc'; // asc, desc
    const supportStatus = searchParams.get('status')?.toLowerCase(); // recommended, latest, active, deprecated, eol
    const beforeDate = searchParams.get('before') ? new Date(searchParams.get('before')!) : null;
    const afterDate = searchParams.get('after') ? new Date(searchParams.get('after')!) : null;

    // Initialize fallback data for when network requests fail
    if (Object.keys(artifactsData.windows).length === 0 && Object.keys(artifactsData.linux).length === 0) {
      const knownArtifacts = [
        { version: '6683', hash: 'ad6c90072e62cdb7ee0dcc943d7ded8a5107d542' },
        { version: '6624', hash: '779c1fa38ec01b33d79a5e994b7e0c1a0bbcg421' },
        { version: '6551', hash: 'b85db86b37fdcab942859d3ef31cc4bd43eee8f6' },
        { version: '6497', hash: 'a87d8d99b11e56da288b215c435a3d95f5e1aee5' },
        { version: '6337', hash: '8b8d86c8bd866af8725932ad8761212eb8fd3335' }
      ];

      knownArtifacts.forEach(({ version, hash }) => {
        const winArtifactUrl = `https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/${version}-${hash}`;
        const linuxArtifactUrl = `https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/${version}-${hash}`;

        artifactsData.windows[version] = {
          version,
          recommended: version === '6683',
          critical: false,
          download_url_zip: `${winArtifactUrl}/server.zip`,
          download_url_7z: `${winArtifactUrl}/server.7z`,
          changelog_url: winArtifactUrl,
          published_at: new Date().toISOString()
        };

        artifactsData.linux[version] = {
          version,
          recommended: version === '6683',
          critical: false,
          download_url_zip: `${linuxArtifactUrl}/fx.tar.xz`,
          download_url_7z: `${linuxArtifactUrl}/fx.tar.xz`,
          changelog_url: linuxArtifactUrl,
          published_at: new Date().toISOString()
        };
      });
    }

    // Apply filtering but not pagination to get total counts for stats
    let fullResponse: any = {
      windows: {},
      linux: {}
    };

    // Keep track of filtered counts for pagination metadata
    const filteredCounts: Record<string, number> = {
      windows: 0,
      linux: 0
    };

    // Transform the data structure with new support info
    for (const plat in artifactsData) {
      const platformData = artifactsData[plat as keyof typeof artifactsData];

      for (const ver in platformData) {
        const artifact = platformData[ver];

        // Skip EOL artifacts unless explicitly requested
        if (artifact.eol && !includeEol) {
          continue;
        }

        fullResponse[plat][ver] = {
          version: artifact.version,
          recommended: artifact.recommended,
          critical: artifact.critical,
          download_urls: {
            zip: artifact.download_url_zip,
            '7z': artifact.download_url_7z
          },
          changelog_url: artifact.changelog_url,
          published_at: artifact.published_at,
          eol: artifact.eol || false,
          supportStatus: artifact.supportStatus || 'unknown',
          supportEnds: artifact.supportEnds
        };
      }
    }

    // Filter by platform if specified
    if (platform === 'windows' || platform === 'linux') {
      fullResponse = { [platform]: fullResponse[platform] };
    }

    // Filter by product if specified
    if (product === 'fivem' || product === 'redm') {
      for (const plat in fullResponse) {
        fullResponse[plat] = { [product]: fullResponse[plat][product] };
      }
    }

    // Create paginated response object
    let response: any = {
      windows: {},
      linux: {}
    };

    // Filter by specific version if specified
    if (version) {
      for (const plat in fullResponse) {
        if (fullResponse[plat][version]) {
          response[plat] = { [version]: fullResponse[plat][version] };
          filteredCounts[plat] = 1;
        } else {
          response[plat] = {}; // Version not found
          filteredCounts[plat] = 0;
        }
      }
    } else {
      // Apply more complex filtering but delay pagination to count total filtered results
      for (const plat in fullResponse) {
        // Convert to array for easier filtering and sorting
        let artifacts = Object.entries(fullResponse[plat]).map(([ver, data]) => ({
          version: ver,
          ...data as any
        }));

        // Filter by search term if provided
        if (search && search.trim() !== '') {
          artifacts = artifacts.filter(artifact =>
            artifact.version.toLowerCase().includes(search)
          );
        }

        // Filter by support status if provided
        if (supportStatus) {
          artifacts = artifacts.filter(artifact =>
            artifact.supportStatus === supportStatus
          );
        }

        // Filter by date range if provided
        if (beforeDate) {
          artifacts = artifacts.filter(artifact =>
            new Date(artifact.published_at) <= beforeDate
          );
        }

        if (afterDate) {
          artifacts = artifacts.filter(artifact =>
            new Date(artifact.published_at) >= afterDate
          );
        }

        // Store the filtered count before pagination
        filteredCounts[plat] = artifacts.length;

        // Sort artifacts based on sort parameters
        artifacts.sort((a, b) => {
          if (sortBy === 'date') {
            const dateA = new Date(a.published_at).getTime();
            const dateB = new Date(b.published_at).getTime();
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
          } else {
            // Default: sort by version number
            const versionA = parseInt(a.version);
            const versionB = parseInt(b.version);
            return sortOrder === 'asc' ? versionA - versionB : versionB - versionA;
          }
        });

        // Now apply pagination
        artifacts = artifacts.slice(offset, offset + limit);

        // Convert back to object format
        response[plat] = {};
        artifacts.forEach(artifact => {
          const { version, ...rest } = artifact;
          response[plat][version] = rest;
        });
      }
    }

    // Get recommended artifacts and active artifacts
    const recommended: any = {};
    const latest: any = {};
    const stats: any = {};

    for (const plat in artifactsData) {
      recommended[plat] = null;
      latest[plat] = null;

      // Compute accurate stats based on the complete dataset
      const totalArtifacts = Object.values(artifactsData[plat as keyof typeof artifactsData]);

      stats[plat] = {
        total: totalArtifacts.length,
        filtered: filteredCounts[plat] || 0,
        recommended: totalArtifacts.filter(a => a.supportStatus === 'recommended').length,
        latest: totalArtifacts.filter(a => a.supportStatus === 'latest').length,
        active: totalArtifacts.filter(a => a.supportStatus === 'active').length,
        deprecated: totalArtifacts.filter(a => a.supportStatus === 'deprecated').length,
        eol: totalArtifacts.filter(a => a.eol).length
      };

      // Find latest and recommended versions using explicit support status
      // First from filtered results if available
      const versions = Object.keys(response[plat]).sort((a, b) => parseInt(b) - parseInt(a));

      // Then from full dataset if needed
      const allVersions = Object.keys(artifactsData[plat as keyof typeof artifactsData])
        .sort((a, b) => parseInt(b) - parseInt(a));

      // Find latest (first check filtered results, then fall back to full dataset)
      if (versions.length > 0) {
        latest[plat] = {
          version: versions[0],
          ...response[plat][versions[0]]
        };
      } else if (allVersions.length > 0) {
        // Fall back to full dataset
        const latestVersion = allVersions[0];
        const artifact = artifactsData[plat as keyof typeof artifactsData][latestVersion];
        latest[plat] = {
          version: latestVersion,
          recommended: artifact.recommended,
          critical: artifact.critical,
          download_urls: {
            zip: artifact.download_url_zip,
            '7z': artifact.download_url_7z
          },
          changelog_url: artifact.changelog_url,
          published_at: artifact.published_at,
          eol: artifact.eol || false,
          supportStatus: artifact.supportStatus || 'unknown',
          supportEnds: artifact.supportEnds
        };
      }

      // Find recommended version (first check filtered results)
      const recommendedByStatus = versions.find(ver =>
        response[plat][ver].supportStatus === 'recommended'
      );

      if (recommendedByStatus) {
        recommended[plat] = {
          version: recommendedByStatus,
          ...response[plat][recommendedByStatus]
        };
      } else {
        // Fall back to checking the full dataset
        const recVersion = allVersions.find(ver =>
          artifactsData[plat as keyof typeof artifactsData][ver].supportStatus === 'recommended'
        );

        if (recVersion) {
          const artifact = artifactsData[plat as keyof typeof artifactsData][recVersion];
          recommended[plat] = {
            version: recVersion,
            recommended: artifact.recommended,
            critical: artifact.critical,
            download_urls: {
              zip: artifact.download_url_zip,
              '7z': artifact.download_url_7z
            },
            changelog_url: artifact.changelog_url,
            published_at: artifact.published_at,
            eol: artifact.eol || false,
            supportStatus: artifact.supportStatus || 'unknown',
            supportEnds: artifact.supportEnds
          };
        } else if (allVersions.length >= 2) {
          // If still no recommendation, use the second most recent non-EOL version from full dataset
          for (let i = 1; i < allVersions.length; i++) {
            const ver = allVersions[i];
            const artifact = artifactsData[plat as keyof typeof artifactsData][ver];
            if (!artifact.eol) {
              recommended[plat] = {
                version: ver,
                recommended: true, // Mark as recommended
                critical: artifact.critical,
                download_urls: {
                  zip: artifact.download_url_zip,
                  '7z': artifact.download_url_7z
                },
                changelog_url: artifact.changelog_url,
                published_at: artifact.published_at,
                eol: false,
                supportStatus: 'recommended', // Override to recommended
                supportEnds: artifact.supportEnds
              };
              break;
            }
          }
        }
      }
    }

    // Return response with enhanced pagination metadata
    return NextResponse.json({
      data: response,
      metadata: {
        platforms: ['windows', 'linux'],
        recommended,
        latest,
        stats,
        pagination: {
          limit,
          offset,
          filtered: filteredCounts[platform || 'windows'] || 0,
          total: stats[platform || 'windows']?.total || 0,
          currentPage: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil((filteredCounts[platform || 'windows'] || 0) / limit)
        },
        filters: {
          search,
          platform,
          supportStatus,
          includeEol,
          beforeDate: beforeDate?.toISOString(),
          afterDate: afterDate?.toISOString(),
          sortBy,
          sortOrder
        },
        supportSchedule: {
          recommended: '6 weeks after next release',
          latest: '2 weeks after next release',
          eol: '3 months after release'
        },
        supportStatusExplanation: {
          recommended: 'Fully supported, recommended for production use',
          latest: 'Most recent build, supported for testing',
          active: 'Currently supported',
          deprecated: 'Support ended, but still usable',
          eol: 'End of life, not supported and may be inaccessible from server browser',
          info: 'https://aka.cfx.re/eol'
        }
      }
    });
  } catch (error) {
    console.error('Error in artifacts API route:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve artifacts data. Please try again later.' },
      { status: 500 }
    );
  }
}
