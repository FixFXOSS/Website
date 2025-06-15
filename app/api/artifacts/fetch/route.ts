import { NextRequest, NextResponse } from 'next/server';
import { githubFetcher } from '@utils/functions/githubFetcher';
import type { ArtifactData, ArtifactCategory, GitHubTag } from '@utils/types';

// Enhanced cache management
let artifactsCache: ArtifactData | null = null;
let lastFetchTime = 0;
let etagCache: string | null = null;
const CACHE_DURATION = 3600000; // 1 hour cache

// Known artifacts as fallback
const FALLBACK_ARTIFACTS = [
  { version: '6683', hash: 'ad6c90072e62cdb7ee0dcc943d7ded8a5107d542' },
  { version: '6624', hash: '779c1fa38ec01b33d79a5e994b7e0c1a0bbcg421' },
  { version: '6551', hash: 'b85db86b37fdcab942859d3ef31cc4bd43eee8f6' },
  { version: '6497', hash: 'a87d8d99b11e56da288b215c435a3d95f5e1aee5' },
  { version: '6337', hash: '8b8d86c8bd866af8725932ad8761212eb8fd3335' }
];

// Route segment configuration
export const runtime = 'nodejs';
export const preferredRegion = 'auto';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    // Set up headers for conditional request
    const headers: Record<string, string> = {};
    if (etagCache) {
      headers['If-None-Match'] = etagCache;
    }

    // Fetch tags with pagination more efficiently
    async function fetchAllTags(): Promise<GitHubTag[]> {
      try {
        const allTags: GitHubTag[] = [];
        let page = 1;
        const PER_PAGE = 100;

        const initialResponse = await githubFetcher.get<GitHubTag[]>(
          `/repos/citizenfx/fivem/tags?per_page=${PER_PAGE}&page=${page}`,
          { headers }
        );

        // If we get a 304, return cached data instead of empty array
        if (initialResponse.status === 304) {
          console.log('Using cached GitHub tags data');
          if (artifactsCache) {
            return []; // Signal to use cache
          }
          // If no cache, continue with fallback data
          throw new Error('No cached data available');
        }

        // Store the new etag
        etagCache = initialResponse.headers.etag;

        allTags.push(...initialResponse.data);

        // Check if we need more pages - limit to recent 500 tags for performance
        const linkHeader = initialResponse.headers.link;
        const lastPageMatch = linkHeader?.match(/page=(\d+)>; rel="last"/);
        const totalPages = lastPageMatch ? Math.min(parseInt(lastPageMatch[1]), 5) : 1;

        // Fetch remaining pages in parallel (up to 4 pages = ~400 tags)
        if (totalPages > 1) {
          const pagePromises = [];
          for (let i = 2; i <= totalPages; i++) {
            pagePromises.push(
              githubFetcher.get<GitHubTag[]>(`/repos/citizenfx/fivem/tags?per_page=${PER_PAGE}&page=${i}`)
                .then(response => response.data)
            );
          }

          const results = await Promise.all(pagePromises);
          results.forEach(tags => allTags.push(...tags));
        }

        return allTags;
      } catch (error) {
        console.error('Error fetching tags:', error);
        if (artifactsCache) {
          console.log('Using cached data due to fetch error');
          return [];
        }
        // If no cache available, use fallback data
        applyFallbackData(processedData);
        return [];
      }
    }

    const allTags = await fetchAllTags();

    // If we got an empty array due to 304 Not Modified, return cache
    if (allTags.length === 0 && artifactsCache) {
      return artifactsCache;
    }

    console.log(`Fetched ${allTags.length} tags from GitHub`);

    // Batch commit requests to improve performance (10 at a time)
    const batchSize = 10;
    for (let i = 0; i < allTags.length; i += batchSize) {
      const batch = allTags.slice(i, i + batchSize);

      // Create a batch of promises
      const commitPromises = batch.map(tag => {
        // Extract version from tag name
        const versionMatch = tag.name.match(/v\d+\.\d+\.\d+[._-](\d+)/);
        if (!versionMatch) {
          return Promise.resolve(null);
        }

        return githubFetcher.get<{ commit: { committer: { date: string } } }>(
          `/repos/citizenfx/fivem/commits/${tag.commit.sha}`
        ).then(commitResponse => {
          const version = versionMatch[1];
          const sha = tag.commit.sha;
          const artifactId = `${version}-${sha}`;
          const commitDate = commitResponse.data.commit.committer.date;

          // Base URLs for artifacts
          const windowsBaseUrl = `https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/${artifactId}`;
          const linuxBaseUrl = `https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/${artifactId}`;

          // Create artifact entries
          processedData.windows[version] = {
            version,
            recommended: false,
            critical: false,
            download_urls: {
              zip: `${windowsBaseUrl}/server.zip`,
              '7z': `${windowsBaseUrl}/server.7z`
            },
            artifact_url: windowsBaseUrl,
            published_at: commitDate
          };

          processedData.linux[version] = {
            version,
            recommended: false,
            critical: false,
            download_urls: {
              zip: `${linuxBaseUrl}/fx.tar.xz`,
              '7z': `${linuxBaseUrl}/fx.tar.xz`
            },
            artifact_url: linuxBaseUrl,
            published_at: commitDate
          };

          return version;
        }).catch(err => {
          console.error(`Failed to fetch commit for ${tag.name}:`, err);
          return null;
        });
      });

      // Wait for all promises in this batch
      await Promise.all(commitPromises);

      // Short pause to avoid hitting rate limits
      if (i + batchSize < allTags.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
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

    if (artifactsCache) {
      console.log('Using cached data due to fetch error');
      return artifactsCache;
    }

    // Apply fallback data if no cache available
    applyFallbackData(processedData);
    return processedData;
  }
}

// Apply fallback data when network requests fail
function applyFallbackData(data: ArtifactData) {
  console.log('Applying fallback artifact data');
  FALLBACK_ARTIFACTS.forEach(({ version, hash }) => {
    const timestamp = new Date().toISOString();
    const winArtifactUrl = `https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/${version}-${hash}`;
    const linuxArtifactUrl = `https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/${version}-${hash}`;

    data.windows[version] = {
      version,
      recommended: version === '6683',
      critical: false,
      download_urls: {
        zip: `${winArtifactUrl}/server.zip`,
        '7z': `${winArtifactUrl}/server.7z`
      },
      artifact_url: winArtifactUrl,
      published_at: timestamp,
      eol: false,
      supportStatus: version === '6683' ? 'recommended' : 'active',
      supportEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
    };

    data.linux[version] = {
      version,
      recommended: version === '6683',
      critical: false,
      download_urls: {
        zip: `${linuxArtifactUrl}/fx.tar.xz`,
        '7z': `${linuxArtifactUrl}/fx.tar.xz`
      },
      artifact_url: linuxArtifactUrl,
      published_at: timestamp,
      eol: false,
      supportStatus: version === '6683' ? 'recommended' : 'active',
      supportEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
  });
}

// Calculate support status based on release dates and recommended status
function calculateSupportStatus(artifacts: ArtifactCategory): ArtifactCategory {
  const versions = Object.keys(artifacts)
    .sort((a, b) => parseInt(b) - parseInt(a));

  const now = new Date();
  const SIX_WEEKS_MS = 42 * 24 * 60 * 60 * 1000;
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

  let recommendedVersion = null;
  if (versions.length >= 2) {
    recommendedVersion = versions[1];
    artifacts[recommendedVersion].recommended = true;
  } else if (versions.length === 1) {
    recommendedVersion = versions[0];
    artifacts[recommendedVersion].recommended = true;
  }

  for (let i = 0; i < versions.length; i++) {
    const version = versions[i];
    const artifact = artifacts[version];
    const nextVersion = i > 0 ? versions[i - 1] : null;
    const nextReleaseDate = nextVersion ? new Date(artifacts[nextVersion].published_at) : now;

    let supportEndsDate: Date;
    let supportStatus: string;

    if (version === recommendedVersion) {
      supportEndsDate = new Date(nextReleaseDate.getTime() + SIX_WEEKS_MS);
      supportStatus = "recommended";
    } else if (i === 0) {
      supportEndsDate = new Date(nextReleaseDate.getTime() + TWO_WEEKS_MS);
      supportStatus = "latest";
    } else {
      supportEndsDate = new Date(nextReleaseDate.getTime() + TWO_WEEKS_MS);
      supportStatus = "active";
    }

    if (supportEndsDate < now) {
      supportStatus = "eol";
    }

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

    const version = searchParams.get('version');
    if (version) {
      const now = Date.now();
      if (artifactsCache && (now - lastFetchTime < CACHE_DURATION)) {
        const response: any = {
          windows: {},
          linux: {}
        };
        const platform = searchParams.get('platform')?.toLowerCase();
        const platforms = platform === 'windows' || platform === 'linux'
          ? [platform] : ['windows', 'linux'];

        let found = false;
        for (const plat of platforms) {
          const artifact = artifactsCache[plat as keyof typeof artifactsCache][version];
          if (artifact) {
            response[plat] = {
              [version]: {
                ...artifact,
                eol: artifact.eol || false,
                supportStatus: artifact.supportStatus || 'unknown',
              }
            };
            found = true;
          } else {
            response[plat] = {};
          }
        }

        if (found) {
          return NextResponse.json({
            data: response,
            metadata: {
              platforms: platforms,
              recommended: null,
              latest: null,
              stats: null,
              pagination: { limit: 1, offset: 0, filtered: 1, total: 1, currentPage: 1, totalPages: 1 },
              filters: { version },
              supportSchedule: {
                recommended: '6 weeks after next release',
                latest: '2 weeks after next release',
                eol: '3 months after release'
              },
            }
          });
        }
      }
    }

    const artifactsPromise = fetchArtifacts();
    const timeoutPromise = new Promise<ArtifactData>((_, reject) => {
      setTimeout(() => reject(new Error('Fetching operation timed out')), 15000);
    });

    const artifactsData = await Promise.race([artifactsPromise, timeoutPromise]);

    if (Object.keys(artifactsData.windows).length === 0 && Object.keys(artifactsData.linux).length === 0) {
      applyFallbackData(artifactsData);
    }

    const platform = searchParams.get('platform')?.toLowerCase();
    const product = searchParams.get('product')?.toLowerCase();
    const search = searchParams.get('search')?.toLowerCase();
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');
    const includeEol = searchParams.get('includeEol') === 'true';
    const sortBy = searchParams.get('sortBy') || 'version';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const supportStatus = searchParams.get('status')?.toLowerCase();
    const beforeDate = searchParams.get('before') ? new Date(searchParams.get('before')!) : null;
    const afterDate = searchParams.get('after') ? new Date(searchParams.get('after')!) : null;

    let fullResponse: any = {
      windows: {},
      linux: {}
    };

    if (platform === 'windows' || platform === 'linux') {
      fullResponse = { [platform]: {} };
    }

    const filteredCounts: Record<string, number> = {};

    for (const plat in fullResponse) {
      const platformData = artifactsData[plat as keyof typeof artifactsData];
      const filteredArtifacts: any[] = [];

      for (const ver in platformData) {
        const artifact = platformData[ver];

        if (artifact.eol && !includeEol) {
          continue;
        }

        if (search && !ver.toLowerCase().includes(search)) {
          continue;
        }

        if (supportStatus && artifact.supportStatus !== supportStatus) {
          continue;
        }

        if (beforeDate && new Date(artifact.published_at) > beforeDate) {
          continue;
        }

        if (afterDate && new Date(artifact.published_at) < afterDate) {
          continue;
        }

        filteredArtifacts.push({
          version: ver,
          ...artifact,
          eol: artifact.eol || false,
          supportStatus: artifact.supportStatus || 'unknown'
        });
      }

      filteredCounts[plat] = filteredArtifacts.length;

      filteredArtifacts.sort((a, b) => {
        if (sortBy === 'date') {
          const dateA = new Date(a.published_at).getTime();
          const dateB = new Date(b.published_at).getTime();
          return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        } else {
          const versionA = parseInt(a.version);
          const versionB = parseInt(b.version);
          return sortOrder === 'asc' ? versionA - versionB : versionB - versionA;
        }
      });

      const paginatedArtifacts = filteredArtifacts.slice(offset, offset + limit);

      fullResponse[plat] = {};
      paginatedArtifacts.forEach(artifact => {
        const { version, ...rest } = artifact;
        fullResponse[plat][version] = rest;
      });
    }

    const recommended: any = {};
    const latest: any = {};
    const stats: any = {};

    for (const plat in artifactsData) {
      if (!(plat in fullResponse)) continue;

      recommended[plat] = null;
      latest[plat] = null;

      const allArtifacts = Object.values(artifactsData[plat as keyof typeof artifactsData]);

      stats[plat] = {
        total: allArtifacts.length,
        filtered: filteredCounts[plat] || 0,
        recommended: allArtifacts.filter(a => a.supportStatus === 'recommended').length,
        latest: allArtifacts.filter(a => a.supportStatus === 'latest').length,
        active: allArtifacts.filter(a => a.supportStatus === 'active').length,
        deprecated: allArtifacts.filter(a => a.supportStatus === 'deprecated').length,
        eol: allArtifacts.filter(a => a.eol).length
      };

      const sortedVersions = Object.keys(artifactsData[plat as keyof typeof artifactsData])
        .sort((a, b) => parseInt(b) - parseInt(a));

      if (sortedVersions.length > 0) {
        const latestVer = sortedVersions[0];
        const artifact = artifactsData[plat as keyof typeof artifactsData][latestVer];
        latest[plat] = {
          version: latestVer,
          ...artifact,
          eol: artifact.eol || false,
          supportStatus: artifact.supportStatus || 'latest'
        };
      }

      const recommendedVer = sortedVersions.find(ver =>
        artifactsData[plat as keyof typeof artifactsData][ver].supportStatus === 'recommended'
      );

      if (recommendedVer) {
        const artifact = artifactsData[plat as keyof typeof artifactsData][recommendedVer];
        recommended[plat] = {
          version: recommendedVer,
          ...artifact,
          eol: artifact.eol || false,
          supportStatus: 'recommended'
        };
      } else if (sortedVersions.length >= 2) {
        const recVer = sortedVersions[1];
        const artifact = artifactsData[plat as keyof typeof artifactsData][recVer];
        recommended[plat] = {
          version: recVer,
          ...artifact,
          recommended: true,
          eol: artifact.eol || false,
          supportStatus: 'recommended'
        };
      }
    }

    const result = {
      data: fullResponse,
      metadata: {
        platforms: Object.keys(fullResponse),
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
