<script>
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
  import { Play, Info, Heart, Star } from "lucide-svelte"; // Icon library
  import { getContext } from "svelte";

  // ============================================================================
  // COMPONENT PROPS & STATE
  // ============================================================================
  export let mediaList; // Array of media items to rotate through

  // Current media state (reactive)
  let currentStatic = mediaList[0];
  $: current = mediaList[0];

  // Subscribe to cache updates for real-time data sync
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
  // HANDLERS & ACTIONS
  // ============================================================================

  // Navigate to detailed media view
  const view = getContext("view");
  function viewMedia() {
    $view = current;
  }

  // Toggle favorite status (requires AniList auth)
  function toggleFavourite() {
    current.isFavourite = anilistClient.favourite({ id: current.id });
  }

  // Get current media index in the list
  function currentIndex() {
    return mediaList.findIndex((media) => media?.id === currentStatic?.id);
  }

  // ============================================================================
  // AUTO-ROTATION SYSTEM
  // ============================================================================
  // TIP: Change the 15000ms value below to adjust rotation speed
  let timeout = schedule(currentIndex() + 1);

  function schedule(index) {
    return setTimeout(() => {
      current =
        mediaCache.value[mediaList[index % mediaList.length]?.id] ||
        mediaList[index % mediaList.length];
      currentStatic = current;
      timeout = schedule(index + 1);
    }, 15000); // ⏱️ ROTATION INTERVAL: Change this value (in milliseconds)
  }

  // Manually set current media (cancels and restarts auto-rotation)
  function setCurrent(media) {
    if (current?.id === media?.id) return;
    clearTimeout(timeout);
    current = mediaCache.value[media?.id] || media;
    currentStatic = current;
    timeout = schedule(currentIndex() + 1);
  }

  // Handle swipe gestures (left = next, right = previous)
  function swipeMedia(deltaX) {
    if (deltaX < 0)
      setCurrent(mediaList[(currentIndex() + 1) % mediaList.length]);
    else
      setCurrent(
        mediaList[(currentIndex() - 1 + mediaList.length) % mediaList.length],
      );
  }

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================
  // Calculate display rating (convert 0-100 to 0-10 scale)
  $: averageRating = currentStatic.averageScore
    ? (currentStatic.averageScore / 10).toFixed(1)
    : null;
</script>

continue ,<!-- 
================================================================================
TEMPLATE STRUCTURE
================================================================================
Main container with swipe support
├── Background layer (image with fade animation)
├── Overlay layer (dual gradients for text readability)
└── Content layer
    ├── Featured badge
    ├── Title
    ├── Metadata row (rating, format, episodes, season, etc.)
    ├── Genre tags (max 4)
    ├── Description (4 lines max)
    ├── Action buttons (Watch, Info, Score, Favorite)
    └── Progress indicators (dots showing position in carousel)
-->

<div class="banner-container grab" use:drag={swipeMedia}>
  <!-- LAYER 1: Background Image -->
  {#key currentStatic}
    <div
      class="banner-background position-absolute h-full w-full overflow-hidden z--1"
    >
      <SmartImage
        class={`img-cover position-absolute h-full w-full banner-fade ${!(currentStatic.bannerImage || currentStatic.trailer?.id) && settings.value.adult === "hentai" && settings.value.hentaiBanner ? "banner-rotated" : ""}`}
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

  <!-- LAYER 2: Gradient Overlay for Text Readability -->
  <!-- TIP: Adjust opacity values in CSS (lines 155-170) to control darkness -->
  <div class="banner-overlay position-absolute h-full w-full z--1" />

  <!-- LAYER 3: Content Container -->
  <div
    class="banner-content pl-30 pb-30 pr-30 d-flex flex-column justify-content-end h-full"
  >
    <div class="content-wrapper w-800 mw-full">
      <!-- FEATURED BADGE with star icon -->
      <!-- TIP: Remove this entire block (lines 72-75) to hide featured badge -->
      <div class="featured-badge d-inline-flex align-items-center mb-15">
        <Star size="1.4rem" fill="currentColor" class="mr-5" />
        <span class="font-weight-bold">Featured</span>
      </div>

      <!-- TITLE -->
      <!-- TIP: Change font-size in .banner-title CSS (line 197) -->
      <h1 class="banner-title text-white font-weight-very-bold mb-15">
        {anilistClient.title(currentStatic)}
      </h1>

      <!-- METADATA ROW: Rating, Format, Episodes, Season, Age Rating, Audio -->
      <!-- TIP: Add more meta items by following the pattern below -->
      <div
        class="banner-meta d-flex flex-wrap align-items-center mb-15 text-white"
      >
        <!-- Average Score with star icon -->
        {#if averageRating}
          <span class="meta-item meta-rating d-flex align-items-center">
            <Star size="1.4rem" fill="currentColor" class="mr-5" />
            <span class="font-weight-bold">{averageRating}</span>
          </span>
        {/if}

        <!-- Media Format (TV, Movie, OVA, etc.) -->
        {#if currentStatic.format}
          <span class="meta-item">{formatMap[currentStatic.format]}</span>
        {/if}

        <!-- Episode Count or Duration -->
        {#if currentStatic.episodes && currentStatic.episodes !== 1}
          <span class="meta-item">
            {#if current.mediaListEntry?.status === "CURRENT" && current.mediaListEntry?.progress}
              {current.mediaListEntry.progress}/{currentStatic.episodes} Episodes
            {:else}
              {currentStatic.episodes} Episodes
            {/if}
          </span>
        {:else if currentStatic.duration}
          <span class="meta-item">{currentStatic.duration} Min</span>
        {/if}

        <!-- Season & Year -->
        {#if currentStatic.season || currentStatic.seasonYear}
          <span class="meta-item text-capitalize">
            {[currentStatic.season?.toLowerCase(), currentStatic.seasonYear]
              .filter((s) => s)
              .join(" ")}
          </span>
        {/if}

        <!-- Adult Content Badge (18+) -->
        {#if currentStatic.isAdult}
          <span class="meta-item meta-adult">18+</span>
        {/if}

        <!-- Audio Language Label -->
        {#if settings.value.cardAudio}
          <span class="meta-item">
            <AudioLabel bind:media={currentStatic} banner={true} />
          </span>
        {/if}
      </div>

      <!-- GENRE TAGS (limited to first 4) -->
      <!-- TIP: Change slice(0, 4) to show more/fewer genres (line 98) -->
      <div class="banner-genres d-flex flex-wrap mb-15">
        {#each currentStatic.genres?.slice(0, 4) || [] as genre}
          <span class="genre-tag text-capitalize">{genre}</span>
        {/each}
      </div>

      <!-- DESCRIPTION (4 lines with ellipsis overflow) -->
      <!-- TIP: Change 'line-4' to 'line-2', 'line-3', etc. to show more/fewer lines -->
      <p class="banner-description text-white mb-20 line-4 overflow-hidden">
        {currentStatic.description
          ?.replace(/<[^>]*>/g, "")
          .replace(/\s+/g, " ")
          .trim() || ""}
      </p>

      <!-- ACTION BUTTONS ROW -->
      <div class="banner-actions d-flex flex-wrap mb-20">
        <!-- Primary Action: Watch/Continue/Rewatch -->
        <!-- TIP: Button text changes based on watch progress -->
        <button
          class="btn banner-play-btn d-flex align-items-center mr-10 shadow-none"
          use:click={() => playMedia(currentStatic)}
        >
          <Play size="2.4rem" fill="currentColor" class="mr-15" />
          <span class="font-weight-bold text-uppercase letter-spacing-1"
            >{current.mediaListEntry?.progress
              ? current.mediaListEntry?.status === "COMPLETED"
                ? "Rewatch"
                : "Continue"
              : "Watch Now"}</span
          >
        </button>

        <!-- Secondary Action: View Details -->
        <button
          class="btn banner-info-btn d-flex align-items-center mr-10 shadow-none"
          use:click={viewMedia}
        >
          <Info size="2.4rem" class="mr-15" />
          <span class="font-weight-bold text-uppercase letter-spacing-1">More Info</span>
        </button>

        <!-- Scoring Component (if user is authorized) -->
        {#if Helper.isAuthorized()}
          <div class="mr-10">
            <Scoring media={current} />
          </div>
        {/if}

        <!-- Favorite Toggle (if authenticated with AniList) -->
        {#if Helper.isAniAuth()}
          <button
            class="btn btn-icon bg-dark-light text-white btn-square shadow-none border-0 d-flex align-items-center justify-content-center"
            use:click={toggleFavourite}
            title={current.isFavourite ? "Unfavourite" : "Favourite"}
          >
            <Heart
              size="2rem"
              color={current.isFavourite ? "#ff6b9d" : "currentColor"}
              fill={current.isFavourite ? "#ff6b9d" : "transparent"}
            />
          </button>
        {/if}
      </div>

      <!-- PROGRESS INDICATORS (carousel position dots) -->
      <!-- TIP: Adjust sizes in CSS (lines 358-373) -->
      <div class="banner-indicators d-flex">
        {#each mediaList as media}
          {@const active = currentStatic?.id === media?.id}
          <button
            class="indicator-btn bg-transparent border-0 p-0 mr-10"
            class:pointer={!active}
            use:click={() => setCurrent(media)}
            aria-label={`View ${anilistClient.title(media)}`}
            disabled={active}
          >
            <div class="indicator-bar rounded" class:active>
              <div class="indicator-progress rounded" />
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  /* ==========================================================================
     CONTAINER & LAYOUT
     ========================================================================== */

  .banner-container {
    position: relative;
    width: 100%;
    height: 50rem; /* 🎯 MAIN HEIGHT: Adjust for taller/shorter banner */
    overflow: hidden;
    margin-bottom: 2rem;
  }

  /* Background fade-in animation when changing media */
  .banner-background {
    animation: banner-fade 0.8s ease; /* ⏱️ Adjust duration here */
  }

  @keyframes banner-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ==========================================================================
     GRADIENT OVERLAY
     ========================================================================== 
     
     This creates the dark overlay that makes text readable over images.
     Two gradients combined:
     1. Left-to-right: Dark on left, transparent on right
     2. Bottom-to-top: Dark on bottom, transparent on top
     
     TIP: Increase opacity values for darker overlay, better text contrast
  */
  .banner-overlay {
    background: linear-gradient(
        to right,
        hsla(var(--dark-color-hsl), 0.98) 0%,
        /* Darkest point (left) */ hsla(var(--dark-color-hsl), 0.85) 35%,
        /* Fade point 1 */ hsla(var(--dark-color-hsl), 0.6) 55%,
        /* Fade point 2 */ hsla(var(--dark-color-hsl), 0.3) 75%,
        /* Fade point 3 */ transparent 100% /* Fully transparent (right) */
      ),
      linear-gradient(
        to top,
        hsla(var(--dark-color-hsl), 0.95) 0%,
        /* Darkest point (bottom) */ hsla(var(--dark-color-hsl), 0.6) 25%,
        /* Fade point 1 */ hsla(var(--dark-color-hsl), 0.3) 50%,
        /* Fade point 2 */ transparent 100% /* Fully transparent (top) */
      );
  }

  /* ==========================================================================
     CONTENT POSITIONING & ANIMATION
     ========================================================================== */

  .banner-content {
    position: relative;
    z-index: 1;
  }

  /* Fade-in and slide-up animation for content */
  .content-wrapper {
    animation: content-fade-in 0.8s ease 0.2s both; /* 0.2s delay for stagger */
  }

  @keyframes content-fade-in {
    from {
      opacity: 0;
      transform: translateY(
        2rem
      ); /* 🎬 Change to translateX for horizontal slide */
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ==========================================================================
     FEATURED BADGE
     ========================================================================== */

  .featured-badge {
    background: hsla(45, 100%, 50%, 0.15); /* 🎨 Gold background */
    color: #ffd700; /* 🎨 Gold text */
    padding: 0.6rem 1.4rem;
    border-radius: 2rem;
    font-size: 1.3rem;
    backdrop-filter: blur(1rem); /* ✨ Glassmorphism effect */
    border: 0.1rem solid hsla(45, 100%, 50%, 0.3);
  }

  /* ==========================================================================
     TITLE STYLING
     ========================================================================== */

  .banner-title {
    font-size: 4.5rem; /* 📐 DESKTOP SIZE: Main title size */
    line-height: 1.1;
    text-shadow: 0.2rem 0.4rem 1.2rem hsla(var(--black-color-hsl), 0.9); /* Readability */
    letter-spacing: -0.05rem; /* Tight spacing for modern look */
    max-width: 100%;
    
    /* ✂️ Multi-line Truncation (Cinema Style) */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-word;
  }

  /* ==========================================================================
     METADATA ROW
     ========================================================================== */

  .banner-meta {
    font-size: 1.5rem;
    font-weight: 600;
    gap: 1.2rem; /* Space between metadata items */
  }

  .meta-item {
    display: flex;
    align-items: center;
    color: hsla(var(--white-color-hsl), 0.9);
  }

  /* Rating display with gold star */
  .meta-rating {
    color: #ffd700; /* 🎨 Gold for rating */
  }

  /* 18+ Adult content badge */
  .meta-adult {
    background: hsla(0, 75%, 50%, 0.2); /* 🎨 Red background */
    color: #ef4444; /* 🎨 Red text */
    padding: 0.4rem 1rem;
    border-radius: 0.5rem;
    font-weight: 700;
    border: 0.1rem solid hsla(0, 75%, 50%, 0.4);
  }

  .banner-genres {
    gap: 1rem;
  }

  /* ==========================================================================
     DESCRIPTION
     ========================================================================== */

  .banner-description {
    font-size: 1.5rem;
    line-height: 1.7;
    color: hsla(var(--white-color-hsl), 0.88);
    text-shadow: 0.1rem 0.2rem 0.6rem hsla(var(--black-color-hsl), 0.7); /* Readability */
    max-width: 70rem; /* Prevent description from being too wide */
  }



  /* ==========================================================================
     PROGRESS INDICATORS (Carousel Dots)
     ========================================================================== */

  .banner-indicators {
    gap: 1rem;
  }

  .indicator-btn {
    cursor: pointer;
  }

  .indicator-btn[disabled] {
    cursor: default;
  }

  /* Indicator bar styling */
  .indicator-bar {
    width: 3.5rem; /* 📐 Inactive width */
    height: 0.4rem; /* 📐 Bar height */
    background: hsla(var(--white-color-hsl), 0.25); /* Dim when inactive */
    overflow: hidden;
    transition: all 0.4s ease;
  }

  /* Active indicator (current media) */
  .indicator-bar.active {
    width: 5.5rem; /* 📐 Expands when active */
    background: hsla(var(--white-color-hsl), 0.4); /* Brighter when active */
  }

  /* Progress fill animation inside active indicator */
  .indicator-progress {
    height: 100%;
    width: 0;
    background: white;
    transition: none;
  }

  .indicator-bar.active .indicator-progress {
    animation: banner-progress-fill 15s linear; /* ⏱️ MUST MATCH rotation interval */
    will-change: width;
  }

  @keyframes banner-progress-fill {
    from {
      width: 0;
    }
    to {
      width: 100%;
    }
  }

  /* ==========================================================================
     RESPONSIVE BREAKPOINTS
     ========================================================================== */

  /* TABLET: 768px and below */
  @media (max-width: 768px) {
    .banner-container {
      height: 42rem; /* 📏 Adjust tablet height */
    }

    .banner-content {
      padding-left: 2rem;
      padding-right: 2rem;
      padding-bottom: 2rem;
    }

    .content-wrapper {
      max-width: 100%;
    }

    .banner-title {
      font-size: 3rem; /* 📏 Smaller title for tablet */
      line-height: 1.15;
    }

    .banner-meta {
      font-size: 1.4rem;
    }

    .banner-description {
      font-size: 1.4rem;
      max-width: 100%;
      -webkit-line-clamp: 3; /* 📏 Show fewer lines on tablet */
      line-clamp: 3;
    }

    .banner-actions .btn {
      min-height: 4rem; /* 📏 Smaller buttons */
      padding-left: 1.5rem;
      padding-right: 1.5rem;
    }

    .btn-icon {
      width: 4rem;
      height: 4rem;
    }
  }

  /* MOBILE: 480px and below */
  @media (max-width: 480px) {
    .banner-container {
      height: 38rem; /* 📏 Adjust mobile height */
    }

    .banner-content {
      padding-left: 1.5rem;
      padding-right: 1.5rem;
      padding-bottom: 1.5rem;
    }

    .banner-title {
      font-size: 2.4rem; /* 📏 Even smaller title for mobile */
      line-height: 1.2;
      margin-bottom: 1rem;
    }

    .banner-meta {
      font-size: 1.3rem;
      margin-bottom: 1rem;
    }

    .featured-badge {
      font-size: 1.2rem;
      padding: 0.5rem 1.2rem;
      margin-bottom: 1rem;
    }

    .banner-description {
      font-size: 1.3rem;
      margin-bottom: 1.5rem;
      -webkit-line-clamp: 2; /* 📏 Fewest lines on mobile */
      line-clamp: 2;
    }

    /* Hide genres on very small screens */
    .banner-genres {
      display: none;
    }

    .banner-actions {
      margin-bottom: 1.5rem;
    }

    .banner-actions .btn {
      min-height: 3.8rem;
      font-size: 1.4rem;
      padding-left: 1.2rem;
      padding-right: 1.2rem;
    }

    /* Hide button text, show only icons on mobile */
    .banner-actions .btn span {
      display: none;
    }

    .banner-actions .btn .lucide {
      margin-right: 0 !important;
    }

    .btn-icon {
      width: 3.8rem;
      height: 3.8rem;
    }

    /* Smaller progress indicators */
    .indicator-bar {
      width: 3rem;
    }

    .indicator-bar.active {
      width: 4.5rem;
    }
  }

  /* ==========================================================================
     UTILITY CLASSES (if not already defined elsewhere)
     ========================================================================== */

  .position-absolute {
    position: absolute;
  }
  .position-relative {
    position: relative;
  }
  .h-full {
    height: 100%;
  }
  .w-full {
    width: 100%;
  }
  .w-800 {
    width: 80rem;
  }
  .mw-full {
    max-width: 100%;
  }
  .z--1 {
    z-index: -1;
  }
  .z-1 {
    z-index: 1;
  }

  .d-flex {
    display: flex;
  }
  .d-inline-flex {
    display: inline-flex;
  }
  .flex-column {
    flex-direction: column;
  }
  .flex-wrap {
    flex-wrap: wrap;
  }
  .justify-content-end {
    justify-content: flex-end;
  }
  .justify-content-center {
    justify-content: center;
  }
  .justify-content-start {
    justify-content: flex-start;
  }
  .align-items-center {
    align-items: center;
  }

  .text-white {
    color: white;
  }
  .text-dark {
    color: var(--dark-color);
  }
  .text-capitalize {
    text-transform: capitalize;
  }
  .text-center {
    text-align: center;
  }

  .font-weight-bold {
    font-weight: 600;
  }
  .font-weight-very-bold {
    font-weight: 700;
  }

  .mb-5 {
    margin-bottom: 0.5rem;
  }
  .mb-10 {
    margin-bottom: 1rem;
  }
  .mb-15 {
    margin-bottom: 1.5rem;
  }
  .mb-20 {
    margin-bottom: 2rem;
  }
  .mr-5 {
    margin-right: 0.5rem;
  }
  .mr-10 {
    margin-right: 1rem;
  }
  .mr-15 {
    margin-right: 1.5rem;
  }

  .pl-30 {
    padding-left: 3rem;
  }
  .pr-30 {
    padding-right: 3rem;
  }
  .pb-30 {
    padding-bottom: 3rem;
  }

  .px-20 {
    padding-left: 2rem;
    padding-right: 2rem;
  }
  .py-10 {
    padding-top: 1rem;
    padding-bottom: 1rem;
  }

  .rounded {
    border-radius: 0.4rem;
  }

  .overflow-hidden {
    overflow: hidden;
  }

  .grab {
    cursor: grab;
  }
  .grab:active {
    cursor: grabbing;
  }

  .bg-white {
    background-color: white;
  }
  .bg-dark-light {
    background-color: var(--dark-color-light);
  }
  .bg-transparent {
    background-color: transparent;
  }

  .border-0 {
    border: none;
  }
  .shadow-none {
    box-shadow: none;
  }

  .line-4 {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }

  .img-cover {
    object-fit: cover;
  }

  /* Custom class for rotated banner images for adult content */
  .banner-rotated {
    transform: rotate(180deg);
  }

  /* ==========================================================================
     CUSTOM BUTTONS
     ========================================================================== */
  .banner-play-btn {
    background: rgba(255, 255, 255, 0.1); /* Transparent/Subtle fill */
    border: 0.2rem solid rgba(255, 255, 255, 0.85); /* Stylish White Border */
    color: white;
    padding: 1.6rem 4.5rem; /* Huge Padding */
    font-size: 1.8rem; /* Huge Font */
    font-weight: 800;
    backdrop-filter: blur(1.5rem);
    border-radius: 1rem;
    display: flex;
    align-items: center;
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    text-transform: uppercase;
    letter-spacing: 0.2rem;
    box-shadow: 0 1rem 2.5rem rgba(0,0,0,0.25);
  }

  .banner-play-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: translateY(-0.3rem) scale(1.02);
    box-shadow: 0 0.5rem 3rem rgba(255, 255, 255, 0.3);
    border-color: white;
  }

  .banner-info-btn {
    background: rgba(100, 100, 100, 0.45); /* Darker Glass */
    border: 0.2rem solid transparent; /* Align size with play button */
    color: hsla(var(--white-color-hsl), 0.9);
    padding: 1.6rem 3.5rem;
    font-size: 1.6rem;
    font-weight: 700;
    backdrop-filter: blur(1.5rem);
    border-radius: 1rem;
    display: flex;
    align-items: center;
    transition: all 0.3s ease;
    text-transform: uppercase;
    letter-spacing: 0.15rem;
  }

  .banner-info-btn:hover {
    background: rgba(120, 120, 120, 0.65);
    color: white;
    transform: translateY(-0.3rem);
    box-shadow: 0 0.5rem 2rem rgba(0,0,0,0.3);
  }
</style>
