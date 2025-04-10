'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { NativesSidebar } from '@/components/natives/natives-sidebar';
import { NativesContent } from '@/components/natives/natives-content';
import { NativesFilterSheet } from '@/components/natives/natives-filter-sheet';
import { MobileNativesHeader } from '@/components/natives/mobile-natives-header';
import { Search, X } from 'lucide-react';
import { Button } from '@ui/components/button';
import { MobileNavigation } from '@/components/common/mobile-navigation';
import { useFetch } from '@core/useFetch';
import { Input } from '@ui/components/input';

export default function NativesPage() {
  // State for filters with proper defaults
  const [game, setGame] = useState<'gta5' | 'rdr3'>('gta5');
  const [environment, setEnvironment] = useState<'all' | 'client' | 'server'>('all');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesByGameAndEnv, setCategoriesByGameAndEnv] = useState<Record<string, Record<string, string[]>> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [includeCFX, setIncludeCFX] = useState(true); // Default to true
  const [hasCFXNamespace, setHasCFXNamespace] = useState(false);

  // Mobile state
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Keep a reference to the last timeouts for debouncing URL updates
  const urlUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch categories on mount (one-time load)
  const { data: metaData, isPending: isMetaDataLoading } = useFetch<{
    metadata: {
      namespaces: string[],
      namespacesByGameAndEnv: Record<string, Record<string, string[]>>,
      hasCfxNamespace: boolean,
      namespaceStats: Array<{
        namespace: string;
        count: number;
        client: number;
        server: number;
        shared: number;
        isCfx: boolean;
      }>
    }
  }>(
    `/api/natives?game=${game}&limit=1&cfx=${includeCFX}&full=true`,
    {},
    [game, includeCFX]
  );

  // Update categories and CFX flag when metadata changes
  useEffect(() => {
    if (metaData?.metadata) {
      // Set both the flat namespaces list and the structured one
      if (metaData.metadata.namespaces) {
        console.log("Categories loaded:", metaData.metadata.namespaces.length);
        setCategories(metaData.metadata.namespaces);
      }

      if (metaData.metadata.namespacesByGameAndEnv) {
        console.log("Organized categories loaded by game and environment");
        setCategoriesByGameAndEnv(metaData.metadata.namespacesByGameAndEnv);
      }

      // Track if CFX namespace is available
      if (metaData.metadata.hasCfxNamespace !== undefined) {
        setHasCFXNamespace(metaData.metadata.hasCfxNamespace);
      }
    }
  }, [metaData]);

  // Reset category when game or environment changes if the category doesn't exist
  useEffect(() => {
    if (!categoriesByGameAndEnv) return;

    // Get current game and environment categories
    const currentGameEnvCategories =
      categoriesByGameAndEnv[game]?.[environment] || [];

    // If current category is not in the list and is not empty, reset it
    if (category && !currentGameEnvCategories.includes(category)) {
      console.log(`Category ${category} not available in ${game}/${environment}, resetting`);
      setCategory('');
    }
  }, [game, environment, category, categoriesByGameAndEnv]);

  // Handlers with improved logging
  const handleGameChange = useCallback((newGame: 'gta5' | 'rdr3') => {
    console.log("Changing game from", game, "to", newGame);
    setGame(newGame);
  }, [game]);

  const handleEnvironmentChange = useCallback((newEnv: 'all' | 'client' | 'server') => {
    console.log("Changing environment from", environment, "to", newEnv);
    setEnvironment(newEnv);
  }, [environment]);

  const handleCategoryChange = useCallback((newCategory: string) => {
    console.log("Changing category from", category, "to", newCategory);
    setCategory(newCategory);
  }, [category]);

  const handleToggleCFX = useCallback(() => {
    console.log("Toggling CFX from", includeCFX, "to", !includeCFX);
    setIncludeCFX(prev => !prev);
  }, [includeCFX]);

  // Function to handle search submission with proper redirection and debouncing
  const handleSearchSubmit = useCallback((query: string) => {
    // Update the state immediately for the UI
    setSearchQuery(query);
    setSearchInputValue(query);

    // Debounce updating the URL to avoid excessive history entries
    if (urlUpdateTimeoutRef.current) {
      clearTimeout(urlUpdateTimeoutRef.current);
    }

    urlUpdateTimeoutRef.current = setTimeout(() => {
      // Update the URL to include the search query (only after debounce)
      const url = new URL(window.location.href);

      // Set search parameter or remove it if empty
      if (query) {
        url.searchParams.set('search', query);
      } else {
        url.searchParams.delete('search');
      }

      // Preserve other parameters
      if (game !== 'gta5') url.searchParams.set('game', game);
      if (environment !== 'all') url.searchParams.set('env', environment);
      if (category) url.searchParams.set('category', category);
      if (!includeCFX) url.searchParams.set('cfx', 'false');

      // Update browser URL without reloading
      window.history.replaceState({}, '', url.toString());

      console.log(`Search query updated in URL: "${query}"`);
    }, 800); // 800ms debounce for URL updates (longer than input debounce)

  }, [game, environment, category, includeCFX]);

  // Clean up any pending timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current);
      }
    }
  }, []);

  // Function to reset all filters
  const resetFilters = () => {
    setSearchQuery('');
    setSearchInputValue('');
    setCategory('');
    setEnvironment('all');
    setGame('gta5');
    setIncludeCFX(true);
  };

  // Parse URL search params on initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);

      // Set initial state from URL if present
      const gameParam = params.get('game');
      if (gameParam === 'gta5' || gameParam === 'rdr3') {
        setGame(gameParam);
      }

      const envParam = params.get('env');
      if (envParam === 'all' || envParam === 'client' || envParam === 'server') {
        setEnvironment(envParam);
      }

      const categoryParam = params.get('category');
      if (categoryParam) {
        setCategory(categoryParam);
      }

      const searchParam = params.get('search');
      if (searchParam) {
        setSearchQuery(searchParam);
        setSearchInputValue(searchParam);
      }

      const cfxParam = params.get('cfx');
      if (cfxParam === 'false') {
        setIncludeCFX(false);
      }
    }
  }, []);

  return (
    <div className="relative flex min-h-screen h-screen bg-background overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(88,101,242,0.1),rgba(255,255,255,0))]" />
        <div className="absolute left-0 top-0 h-32 w-32 animate-pulse rounded-full bg-[#5865F2]/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-32 w-32 animate-pulse rounded-full bg-[#5865F2]/20 blur-3xl" />
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex w-full h-full">
        <NativesSidebar
          game={game}
          onGameChange={handleGameChange}
          environment={environment}
          onEnvironmentChange={handleEnvironmentChange}
          categories={categories}
          categoriesByGameAndEnv={categoriesByGameAndEnv}
          category={category}
          onCategoryChange={handleCategoryChange}
          searchQuery={searchInputValue}
          onSearchQueryChange={handleSearchSubmit}
          includeCFX={includeCFX}
          onToggleCFX={handleToggleCFX}
        />
        <main className="flex-1 h-full flex flex-col">
          <NativesContent
            game={game}
            environment={environment}
            category={category}
            searchQuery={searchQuery}
            includeCFX={includeCFX}
          />
        </main>
      </div>

      {/* Mobile layout - Updated with new mobile header */}
      <div className="flex flex-col w-full h-full md:hidden">
        <MobileNativesHeader
          onMenuClick={() => setMobileNavOpen(true)}
          onSearchClick={() => setMobileSearchOpen(true)}
          onFilterClick={() => setFilterSheetOpen(true)}
          game={game}
          environment={environment}
          searchActive={mobileSearchOpen}
        />

        {/* Mobile search input - conditionally rendered */}
        {mobileSearchOpen && (
          <div className="fixed top-0 left-0 right-0 z-[150] bg-fd-background/95 backdrop-blur-md border-b border-[#5865F2]/20 p-3 flex flex-row items-center gap-2">
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSearchSubmit(searchInputValue);
              setMobileSearchOpen(false);
            }} className="flex items-center flex-1 gap-2">
              <Input
                value={searchInputValue}
                onChange={(e) => setSearchInputValue(e.target.value)}
                placeholder="Search natives..."
                className="w-full h-9 bg-fd-background/60"
                autoFocus
              />
              <Button type="submit" size="icon" variant="default" className="h-9 w-9 rounded-md">
                <Search className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-md"
                onClick={() => {
                  setMobileSearchOpen(false);
                  if (searchQuery) {
                    setSearchInputValue('');
                    handleSearchSubmit('');
                  }
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </form>
          </div>
        )}

        {/* Mobile Navigation Dropdown */}
        <MobileNavigation
          isOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          currentPath="/natives"
        />

        {/* Filter Sheet for mobile */}
        <NativesFilterSheet
          isOpen={filterSheetOpen}
          onClose={() => setFilterSheetOpen(false)}
          game={game}
          onGameChange={(newGame) => {
            handleGameChange(newGame);
          }}
          environment={environment}
          onEnvironmentChange={(newEnv) => {
            handleEnvironmentChange(newEnv);
          }}
          categories={categories}
          categoriesByGameAndEnv={categoriesByGameAndEnv}
          category={category}
          onCategoryChange={(newCat) => {
            handleCategoryChange(newCat);
            setFilterSheetOpen(false);
          }}
          includeCFX={includeCFX}
          onToggleCFX={handleToggleCFX}
        />

        <main className="flex-1 h-full flex flex-col mt-16">
          <NativesContent
            game={game}
            environment={environment}
            category={category}
            searchQuery={searchQuery}
            includeCFX={includeCFX}
          />
        </main>
      </div>
    </div>
  );
}