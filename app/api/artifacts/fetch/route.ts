import { NextRequest, NextResponse } from 'next/server';
import { githubFetcher } from '@utils/functions/githubFetcher';
import type { ArtifactData, ArtifactCategory, GitHubTag } from '@utils/types';

// Cache management
let artifactsCache: ArtifactData | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 3600000; // 1 hour cache

export async function fetchArtifacts(): Promise<ArtifactData> {
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
    // Fetch all tags from GitHub using pagination
    let page = 1;
    let hasMore = true;
    const allTags: GitHubTag[] = [];

    while (hasMore) {
      const response = await githubFetcher.get<GitHubTag[]>(`/repos/citizenfx/fivem/tags?per_page=100&page=${page}`);
      const tags = response.data;

      if (tags.length === 0) {
        hasMore = false;
      } else {
        allTags.push(...tags);
        page++;
      }
    }

    console.log(`Fetched ${allTags.length} tags from GitHub`);

    // Process each tag
    for (const tag of allTags) {
      // Extract version number from tag name with more flexible pattern
      // This will match formats like:
      // - v1.0.0.14164
      // - v1.0.0-14164
      // - v1.0.0_14164
      const versionMatch = tag.name.match(/v\d+\.\d+\.\d+[._-](\d+)/);
      if (!versionMatch) {
        console.log(`Skipping tag with invalid format: ${tag.name}`);
        continue;
      }

      // Fetch the full commit details to get the correct date
      const commitResponse = await githubFetcher.get<{ commit: { committer: { date: string } } }>(`/repos/citizenfx/fivem/commits/${tag.commit.sha}`);
      const commitDate = commitResponse.data.commit.committer.date;

      const version = versionMatch[1];
      const sha = tag.commit.sha; // SHA is the "Artifact ID"
      const artifactId = `${version}-${sha}`;

      // Base URLs for artifacts
      const windowsBaseUrl = `https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/${artifactId}`;
      const linuxBaseUrl = `https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/${artifactId}`;

      // Create artifact entries for both platforms
      processedData.windows[version] = {
        version,
        recommended: false, // Will be set by calculateSupportStatus
        critical: false, // Will be set by calculateSupportStatus
        download_urls: {
          zip: `${windowsBaseUrl}/server.zip`,
          '7z': `${windowsBaseUrl}/server.7z`
        },
        artifact_url: windowsBaseUrl,
        published_at: commitDate
      };

      processedData.linux[version] = {
        version,
        recommended: false, // Will be set by calculateSupportStatus
        critical: false, // Will be set by calculateSupportStatus
        download_urls: {
          zip: `${linuxBaseUrl}/fx.tar.xz`,
          '7z': `${linuxBaseUrl}/fx.tar.xz`
        },
        artifact_url: linuxBaseUrl,
        published_at: commitDate
      };
    }

    console.log(`Processed ${Object.keys(processedData.windows).length} artifacts`);

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
  const SIX_WEEKS_MS = 42 * 24 * 60 * 60 * 1000;
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

  // First pass: determine recommended version (second most recent)
  let recommendedVersion = null;
  if (versions.length >= 2) {
    recommendedVersion = versions[1]; // Second most recent
    artifacts[recommendedVersion].recommended = true;
  } else if (versions.length === 1) {
    recommendedVersion = versions[0]; // Only version
    artifacts[recommendedVersion].recommended = true;
  }

  // Second pass: set support status for all artifacts
  for (let i = 0; i < versions.length; i++) {
    const version = versions[i];
    const artifact = artifacts[version];
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
      // Latest artifact - supported until 2 weeks after next release
      supportEndsDate = new Date(nextReleaseDate.getTime() + TWO_WEEKS_MS);
      supportStatus = "latest";
    } else {
      // Regular artifacts - supported until 2 weeks after the next release
      supportEndsDate = new Date(nextReleaseDate.getTime() + TWO_WEEKS_MS);
      supportStatus = "active";
    }

    // Check if artifact is EOL (support has ended)
    if (supportEndsDate < now) {
      supportStatus = "eol";
    }

    // Update artifact with support information
    artifacts[version] = {
      ...artifact,
      supportStatus,
      supportEnds: supportEndsDate.toISOString(),
      eol: supportStatus === "eol"
    };
  }

  return artifacts;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Fetch artifacts first without timeout
    const artifactsData = await fetchArtifacts();

    // Set a timeout for the processing phase
    const timeoutPromise = new Promise<ArtifactData>((_, reject) => {
      setTimeout(() => reject(new Error('Processing operation timed out')), 30000);
    });

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
      console.warn('No artifacts data available, using fallback data');
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
          download_urls: {
            zip: `${winArtifactUrl}/server.zip`,
            '7z': `${winArtifactUrl}/server.7z`
          },
          artifact_url: winArtifactUrl,
          published_at: new Date().toISOString()
        };

        artifactsData.linux[version] = {
          version,
          recommended: version === '6683',
          critical: false,
          download_urls: {
            zip: `${linuxArtifactUrl}/fx.tar.xz`,
            '7z': `${linuxArtifactUrl}/fx.tar.xz`
          },
          artifact_url: linuxArtifactUrl,
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
          download_urls: artifact.download_urls,
          artifact_url: artifact.artifact_url,
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
          download_urls: artifact.download_urls,
          artifact_url: artifact.artifact_url,
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
            download_urls: artifact.download_urls,
            artifact_url: artifact.artifact_url,
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
                download_urls: artifact.download_urls,
                artifact_url: artifact.artifact_url,
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

    // Process the data with timeout protection
    const processData = async () => {
      return {
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
      };
    };

    // Race between processing and timeout
    const result = await Promise.race([processData(), timeoutPromise]);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in artifacts API route:', error);
    if (error instanceof Error && error.message.includes('timed out')) {
      return NextResponse.json(
        { error: 'Request processing timed out. Please try again with fewer filters or a smaller dataset.' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to retrieve artifacts data. Please try again later.' },
      { status: 500 }
    );
  }
}
