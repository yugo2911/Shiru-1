<script>
  // ============================================================================
  // IMPORTS
  // ============================================================================
  import { formatMap, playMedia } from "@/modules/anime/anime.js";
  import { anilistClient } from "@/modules/anilist.js";
  import { settings } from "@/modules/settings.js";
  import { mediaCache } from "@/modules/cache.js";
  import { SUPPORTS } from "@/modules/support.js";
  import { click, drag } from "@/modules/click.js";
  import SmartImage from "@/components/visual/SmartImage.svelte";
  import AudioLabel from "@/views/ViewAnime/AudioLabel.svelte";
  import Scoring from "@/views/ViewAnime/Scoring.svelte";
  import Helper from "@/modules/helper.js";
  import { Play, Heart } from "lucide-svelte";
  import { getContext } from "svelte";

  // ============================================================================
  // PROPS & STATE
  // ============================================================================
  export let mediaList; // Array of media items to display in the banner carousel

  // Current media being displayed (updates reactively)
  let currentStatic = mediaList[0];
  $: current = mediaList[0];

  // Subscribe to cache updates to sync current media with latest data
  mediaCache.subscribe((value) => {
    if (
      current?.id &&
      value &&
      value[current?.id]?.id &&
      JSON.stringify(value[current?.id]) !== JSON.stringify(current)
    ) {
      current = value[current?.id];
      currentStatic = current;
    }
  });

  // ============================================================================
  // ACTIONS & HANDLERS
  // ============================================================================

  // Navigate to detailed view of current media
  const view = getContext("view");
  function viewMedia() {
    $view = current;
  }

  // Toggle favorite status for current media
  function toggleFavourite() {
    current.isFavourite = anilistClient.favourite({ id: current.id });
  }

  // Get index of currently displayed media in the list
  function currentIndex() {
    return mediaList.findIndex((media) => media?.id === currentStatic?.id);
  }

  // ============================================================================
  // AUTO-ROTATION LOGIC
  // ============================================================================
  // Automatically cycles through media every 15 seconds
  let timeout = schedule(currentIndex() + 1);

  function schedule(index) {
    return setTimeout(() => {
      current =
        mediaCache.value[mediaList[index % mediaList.length]?.id] ||
        mediaList[index % mediaList.length];
      currentStatic = current;
      timeout = schedule(index + 1);
    }, 15000); // Change to adjust rotation speed (milliseconds)
  }

  // Manually set current media (cancels auto-rotation and restarts timer)
  function setCurrent(media) {
    if (current?.id === media?.id) return;
    clearTimeout(timeout);
    current = mediaCache.value[media?.id] || media;
    currentStatic = current;
    timeout = schedule(currentIndex() + 1);
  }

  // Handle swipe gestures for mobile navigation
  function swipeMedia(deltaX) {
    if (deltaX < 0)
      setCurrent(mediaList[(currentIndex() + 1) % mediaList.length]);
    else
      setCurrent(
        mediaList[(currentIndex() - 1 + mediaList.length) % mediaList.length],
      );
  }
</script>

<!-- ============================================================================
     LAYOUT STRUCTURE
     ============================================================================
     
     The banner is composed of 4 main layers (z-index order):
     
     1. BACKGROUND LAYER (z--1):
        - Banner/cover image with rotation support for adult content
        - Two gradient overlays (bottom and left)
        - App icon in corner
     
     2. CONTENT LAYER (default z-index):
        - Main container with all text and buttons
        - Uses flexbox column layout justified to bottom
        
     LAYOUT MANIPULATION HINTS:
     ============================================================================
     
     To change overall positioning:
     - Main container uses: d-flex flex-column justify-content-end h-full
     - Change justify-content-end to:
       * justify-content-start (top alignment)
       * justify-content-center (center alignment)
       * justify-content-between (spread content)
     
     To adjust content width:
     - Most elements use: w-600 mw-full (max-width: 600px, then 100%)
     - Change w-600 to w-400, w-800, etc., or remove for full width
     
     To change spacing:
     - Padding: pl-20, pb-20, pt-10, etc. (numbers are relative units)
     - Margins: mr-10, ml-20, etc.
     
     To modify text layout:
     - Title uses: d-inline-block overflow-hidden text-overflow-ellipsis
     - Description uses: line-4 overflow-hidden (limits to 4 lines)
     - Change line-4 to line-2, line-6, etc.
     
     To reposition icon:
     - Icon uses: position-absolute with conditional right-0/left-0
     - Adjust m-10, mr-20, ml-20 for different positioning
     
     To adjust gradient coverage:
     - Gradient-left uses: w-800 (width)
     - Increase/decrease to change gradient spread
     
     To modify button layout:
     - Buttons use: d-flex flex-row
     - Change to flex-column for vertical stacking
     - Adjust px-20 (horizontal padding) for button width
-->

{#key currentStatic}
  <!-- BACKGROUND: Banner/Cover Image -->
  <div class="position-absolute h-full w-full overflow-hidden z--1">
    <SmartImage
      class={`img-cover position-absolute h-full w-full ${!(currentStatic.bannerImage || currentStatic.trailer?.id) && settings.value.adult === "hentai" && settings.value.hentaiBanner ? "banner-rotated" : ""}`}
      images={[
        currentStatic.bannerImage,
        ...(currentStatic.trailer?.id
          ? [
              `https://i.ytimg.com/vi/${currentStatic.trailer.id}/maxresdefault.jpg`,
              `https://i.ytimg.com/vi/${currentStatic.trailer.id}/hqdefault.jpg`,
            ]
          : []),
        currentStatic.coverImage?.extraLarge,
        "./404_banner.png",
      ]}
    />
  </div>
{/key}

<!-- BACKGROUND: Gradient Overlays -->
<div class="gradient-bottom z--1 h-full position-absolute top-0 w-full" />
<div class="gradient-left z--1 h-full position-absolute top-0 w-800" />

<!-- BACKGROUND: App Icon (positioned based on platform) -->
<img
  src="./icon_filled.png"
  class="position-absolute z--1 m-10 p-0 {SUPPORTS.isAndroid ||
  window.version?.platform === `darwin`
    ? `right-0 mr-20 ${!SUPPORTS.isAndroid ? `d-md-none d-sm-h-block` : ``}`
    : `left-0 ml-20 d-md-none d-sm-h-block`}"
  style="width: 4rem; height: 4rem"
  alt="ico"
/>

<!-- MAIN CONTENT CONTAINER: Bottom-aligned flex column with swipe support -->
<div
  class="pl-20 pb-20 justify-content-end d-flex flex-column h-full banner mw-full grab"
  use:drag={swipeMedia}
>
  <!-- SECTION: Title -->
  <div class="text-white font-weight-bold font-scale-40">
    <span class="default-cursor title overflow-hidden d-inline-block pr-5">
      {anilistClient.title(currentStatic)}
    </span>
  </div>

  <!-- SECTION: Metadata Row (format, episodes, audio, rating, season) -->
  <div
    class="details text-white text-capitalize pt-10 pb-10 d-flex w-600 mw-full default-cursor"
  >
    <span class="text-nowrap d-flex align-items-center">
      {#if currentStatic.format}
        {formatMap[currentStatic.format]}
      {/if}
    </span>
    {#if currentStatic.episodes && currentStatic.episodes !== 1}
      <span class="text-nowrap d-flex align-items-center">
        {#if current.mediaListEntry?.status === "CURRENT" && current.mediaListEntry?.progress}
          {current.mediaListEntry.progress} / {currentStatic.episodes} Episodes
        {:else}
          {currentStatic.episodes} Episodes
        {/if}
      </span>
    {:else if currentStatic.duration}
      <span class="text-nowrap d-flex align-items-center">
        {currentStatic.duration + " Minutes"}
      </span>
    {/if}
    {#if settings.value.cardAudio}
      <span class="text-nowrap d-flex align-items-center">
        <AudioLabel bind:media={currentStatic} banner={true} />
      </span>
    {/if}
    {#if currentStatic.isAdult}
      <span class="text-nowrap d-flex align-items-center"> Rated 18+ </span>
    {/if}
    {#if currentStatic.season || currentStatic.seasonYear}
      <span class="text-nowrap d-flex align-items-center">
        {[currentStatic.season?.toLowerCase(), currentStatic.seasonYear]
          .filter((s) => s)
          .join(" ")}
      </span>
    {/if}
  </div>

  <!-- SECTION: Description (limited to 4 lines) -->
  <div class="h-100">
    <div class="text-muted line-4 overflow-hidden w-600 mw-full default-cursor">
      {currentStatic.description
        ?.replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim() || ""}
    </div>
  </div>

  <!-- SECTION: Genres Row -->
  <div
    class="details text-white text-capitalize pt-15 pb-10 d-flex w-600 mw-full default-cursor"
  >
    {#each currentStatic.genres as genre}
      <span class="text-nowrap d-flex align-items-center">
        {genre}
      </span>
    {/each}
  </div>

  <!-- SECTION: Action Buttons Row -->
  <div class="d-flex flex-row pb-10 w-600 mw-full default-cursor">
    <!-- Watch/Continue Button -->
    <button
      class="btn bg-dark-light px-20 shadow-none border-0 d-flex align-items-center justify-content-center"
      title="Watch"
      use:click={() => playMedia(currentStatic)}
    >
      <Play class="mr-10" size="1.7rem" />
      <span
        >{current.mediaListEntry?.progress
          ? current.mediaListEntry?.status === "COMPLETED"
            ? "Rewatch Now"
            : "Continue Now"
          : "Watch Now"}</span
      >
    </button>

    <!-- View Details Button -->
    <button
      class="btn bg-dark-light ml-10 px-20 shadow-none border-0 d-flex align-items-center justify-content-center"
      title="View Details"
      use:click={viewMedia}
    >
      <span>View Details</span>
    </button>

    <!-- Scoring Component (if authorized) -->
    {#if Helper.isAuthorized()}
      <Scoring media={current} />
    {/if}

    <!-- Favorite Button (if authenticated with AniList) -->
    {#if Helper.isAniAuth()}
      <button
        class="btn bg-dark-light btn-square ml-10 d-flex align-items-center justify-content-center shadow-none border-0"
        data-toggle="tooltip"
        data-placement="top"
        data-target-breakpoint="md"
        data-title={current.isFavourite ? "Unfavourite" : "Favourite"}
        use:click={toggleFavourite}
        disabled={!Helper.isAniAuth()}
      >
        <div class="favourite d-flex align-items-center justify-content-center">
          <Heart
            color={current.isFavourite
              ? "var(--tertiary-color)"
              : "currentColor"}
            fill={current.isFavourite ? "var(--tertiary-color)" : "transparent"}
            size="1.7rem"
          />
        </div>
      </button>
    {/if}
  </div>

  <!-- SECTION: Progress Indicators (dots showing which media is active) -->
  <div class="d-flex">
    {#each mediaList as media}
      {@const active = currentStatic?.id === media?.id}
      {@const disabled = active || null}
      <div
        class="pt-10 pb-10 badge-wrapper"
        aria-hidden="true"
        {disabled}
        class:pointer={!active}
        class:default-cursor={active}
        use:click={() => setCurrent(media)}
      >
        <!-- Progress bar that animates when active -->
        <div
          class="rounded bg-dark-light mr-10 progress-badge overflow-hidden progressive"
          {disabled}
          class:active
          style="height: 3px;"
          style:width={active ? "5rem" : "2.7rem"}
        >
          <div class="progress-content h-full" class:bg-white={active} />
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  /* ============================================================================
     GRADIENTS
     ============================================================================ */
  .gradient-bottom {
    background: var(--banner-gradient-bottom);
  }
  .gradient-left {
    background: var(--banner-gradient-left);
  }

  /* ============================================================================
     PROGRESS INDICATORS
     ============================================================================ */
  .progress-badge {
    transition: width 0.8s ease; /* Smooth width transition when becoming active */
  }
  .progress-badge.active .progress-content {
    animation: fill 15s linear; /* Fills over 15 seconds (matches rotation timer) */
    will-change: width;
  }

  @keyframes fill {
    from {
      width: 0;
    }
    to {
      width: 100%;
    }
  }

  /* ============================================================================
     METADATA STYLING
     ============================================================================ */
  /* Adds bullet separators between metadata items */
  .details span + span::before {
    content: "•";
    padding: 0 0.5rem;
    font-size: 0.6rem;
    align-self: center;
    white-space: normal;
    color: var(--dm-muted-text-color) !important;
  }

  /* ============================================================================
     TEXT STYLING
     ============================================================================ */
  .title {
    display: inline-block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis; /* Shows "..." when text is too long */
    max-width: 100%;
    text-shadow: 2px 2px 4px hsla(var(--black-color-hsl), 1); /* Readability shadow */
  }

  /* ============================================================================
     ANIMATIONS
     ============================================================================ */
  .banner,
  img {
    animation: fadeIn ease 0.8s; /* Smooth fade-in when media changes */
    will-change: opacity;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ============================================================================
     UTILITY
     ============================================================================ */
  .default-cursor {
    cursor: default;
  }
</style>
