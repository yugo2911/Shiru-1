<!--
@component
@description Displays a comprehensive modal view for a single anime, including detailed information, episode lists, related content, and user interaction features like playing media, scoring, and favoriting.
@tags anime, detail, modal, view, anilist, media, episodes, recommendations, relations, playback, scoring, favourite
-->
<script>
  import { getContext, onDestroy } from "svelte";
  // Import various modules for anime data, utility functions, settings, caching, IPC, etc.
  import {
    formatMap,
    genreIcons,
    getEpisodeMetadataForMedia,
    getKitsuMappings,
    getMediaMaxEp,
    playMedia,
  } from "@/modules/anime/anime.js";
  import { playAnime } from "@/views/TorrentSearch/TorrentModal.svelte";
  import { copyToClipboard } from "@/modules/clipboard.js";
  import { settings } from "@/modules/settings.js";
  import { mediaCache } from "@/modules/cache.js";
  import { add } from "@/modules/torrent.js";
  import { anilistClient } from "@/modules/anilist.js";
  import { click } from "@/modules/click.js";
  import IPC from "@/modules/ipc.js";
  import Helper from "@/modules/helper.js";

  // Import child components for various sections of the anime view
  import Details from "@/views/ViewAnime/Details.svelte";
  import EpisodeList from "@/views/ViewAnime/EpisodeList.svelte";
  import ToggleList from "@/views/ViewAnime/ToggleList.svelte";
  import Scoring from "@/views/ViewAnime/Scoring.svelte";
  import ViewTrailer from "@/views/ViewAnime/ViewTrailer.svelte";
  import SmartImage from "@/components/visual/SmartImage.svelte";
  import AudioLabel from "@/views/ViewAnime/AudioLabel.svelte";
  import Following from "@/views/ViewAnime/Following.svelte";
  import SmallCard from "@/components/cards/SmallCard.svelte";
  import SmallCardSk from "@/components/skeletons/SmallCardSk.svelte";

  // Import icons from lucide-svelte
  import {
    ArrowLeft,
    Clapperboard,
    Users,
    Heart,
    Play,
    Timer,
    TrendingUp,
    Tv,
    Hash,
    ArrowDown01,
    ArrowUp10,
    Star,
  } from "lucide-svelte";

  /**
   * @type {string[]} overlay - A list of active overlays, used to manage modal visibility.
   *   'viewanime' is added to this list when the anime view is active.
   */
  export let overlay;

  // Retrieves the 'view' context, which likely holds the currently active media ID or object.
  const view = getContext("view");

  let modal; // Binds to the modal div element.
  let container = null; // Binds to the scrollable content container.
  let scrollTags = null; // Binds to the scrollable tags div.
  let scrollGenres = null; // Binds to the scrollable genres div.
  let staticMedia; // Holds the media object for display, preventing flicker during updates.

  const genreColors = {
    Action: "#ff6b6b",
    Adventure: "#55efc4",
    Comedy: "#feca57",
    Drama: "#a29bfe",
    Ecchi: "#ff9ff3",
    Fantasy: "#9c88ff",
    Hentai: "#ff6b81",
    Horror: "#b33939",
    "Mahou Shoujo": "#ff9ff3",
    Mecha: "#54a0ff",
    Music: "#00d2d3",
    Mystery: "#81ecec",
    Psychological: "#ff7675",
    Romance: "#fd79a8",
    "Sci-Fi": "#74b9ff",
    "Slice of Life": "#1dd1a1",
    Sports: "#ff9f43",
    Supernatural: "#a29bfe",
    Thriller: "#d63031",
  };

  /**
   * @type {object | null} media - The currently displayed media object.
   * Reactively updates from `mediaCache` or `$view`.
   */
  $: media = mediaCache.value[$view?.id] || $view;
  /**
   * Updates `staticMedia` when `media` changes, ensuring a stable object for rendering while `media` might be loading/updating.
   */
  $: {
    if (media && (!staticMedia || staticMedia?.id !== media?.id))
      staticMedia = media;
    else if (!media && staticMedia) staticMedia = null;
  }
  /**
   * Subscribes to `mediaCache` to update `media` if the cached value changes for the current ID.
   */
  mediaCache.subscribe((value) => {
    if (value && JSON.stringify(value[media?.id]) !== JSON.stringify(media))
      media = value[media?.id];
  });

  /**
   * @type {boolean} episodeOrder - Determines the sorting order of episodes (true for ascending, false for descending).
   */
  $: episodeOrder = !!staticMedia; // Initialized based on whether staticMedia exists.
  /**
   * @type {boolean} watched - Indicates if the media has been completed by the user.
   */
  $: watched = media?.mediaListEntry?.status === "COMPLETED";
  /**
   * @type {number | undefined} userProgress - The user's current episode progress for the media.
   */
  $: userProgress =
    ["CURRENT", "REPEATING", "PAUSED", "DROPPED"].includes(
      media?.mediaListEntry?.status,
    ) && media?.mediaListEntry?.progress;

  /**
   * @type {number[]} missingIds - An array of media IDs that are not present in the local cache.
   */
  $: missingIds = staticMedia && [];

  /**
   * @type {Promise<import('@/modules/anilist.js').AnilistResult<import('@/modules/anilist.js').Media>> | null} recommendations - Fetches recommendations for the current `staticMedia` from Anilist.
   */
  $: recommendations =
    staticMedia && anilistClient.recommendations({ id: staticMedia.id });

  /**
   * @type {Promise<import('@/modules/anilist.js').AnilistResult<import('@/modules/anilist.js').Page>> | null} searchIDS - Fetches detailed media objects for related and recommended IDs from Anilist.
   * Filters out items already in cache and updates `missingIds`.
   */
  $: searchIDS =
    staticMedia &&
    (async () => {
      const searchIDS = [
        ...(staticMedia.relations?.edges
          ?.filter(({ node }) => node.type === "ANIME")
          .map(({ node }) => node.id) || []),
        ...((await recommendations)?.data?.Media?.recommendations?.edges?.map(
          ({ node }) => node.mediaRecommendation?.id,
        ) || []),
      ];
      if (searchIDS.length === 0) {
        missingIds = searchIDS.filter((id) => !mediaCache.value[id]);
        return Promise.resolve([]);
      }
      const result = await anilistClient.searchAllIDS({
        page: 1,
        perPage: 50,
        id: searchIDS,
      });
      missingIds = searchIDS.filter((id) => !mediaCache.value[id]);
      return Promise.resolve({
        ...result,
        data: {
          ...result.data,
          Page: {
            ...result.data.Page,
            media: (result?.data?.Page?.media || []).filter(
              (media) => mediaCache.value[media.id],
            ),
          },
        },
      });
    })();

  /**
   * Focuses the modal, sets the 'viewanime' overlay, and scrolls the container to the top when `staticMedia` changes.
   */
  $: staticMedia &&
    (modal?.focus(),
    setOverlay(),
    container && container.scrollTo({ top: 0, behavior: "smooth" }));
  /**
   * Re-focuses the modal if `viewanime` is the only active overlay and `staticMedia` exists.
   */
  $: staticMedia &&
    overlay.length === 1 &&
    overlay.includes("viewanime") &&
    modal?.focus();
  /**
   * Closes the view if `staticMedia` becomes null.
   */
  $: !staticMedia && close();
  /**
   * Resets the horizontal scroll position of tags and genres when `staticMedia` changes.
   */
  $: {
    if (staticMedia) {
      if (scrollTags) scrollTags.scrollLeft = 0;
      if (scrollGenres) scrollGenres.scrollLeft = 0;
    }
  }

  /**
   * @type {string} playButtonText - The text displayed on the main play button (e.g., "Watch Now", "Continue Now", "Rewatch Now").
   */
  $: playButtonText = getPlayButtonText(media);

  let episodeList = []; // Stores the list of episodes for the current media.
  let episodeLoad; // Promise that resolves with the episode list.

  /**
   * Reacts to `episodeLoad` promise resolving to populate `episodeList`.
   */
  $: if (episodeLoad) {
    episodeLoad.then((episodes) => {
      episodeList = episodes;
    });
  }

  let resizeObserver; // Observes changes in element dimensions to sync heights.
  let leftColumn, rightColumn; // Binds to the left and right column elements for height synchronization.

  /**
   * Sets up a ResizeObserver to synchronize the height of the right column with the left column when `staticMedia` is present.
   */
  $: {
    resizeObserver?.disconnect();
    if (staticMedia) {
      resizeObserver = new ResizeObserver(syncHeights);
      if (leftColumn) resizeObserver.observe(leftColumn);
    }
  }

  /**
   * Disconnects the ResizeObserver when the component is destroyed to prevent memory leaks.
   */
  onDestroy(() => resizeObserver?.disconnect());

  /**
   * Closes the anime detail view by resetting the `view` context and updating the `overlay` prop.
   */
  function close() {
    $view = null;
    // Delay to allow view transition before removing 'viewanime' from overlay.
    setTimeout(() => {
      if (overlay.includes("viewanime") && !$view)
        overlay = overlay.filter((item) => item !== "viewanime");
    });
  }

  /**
   * Adds 'viewanime' to the `overlay` array if it's not already present.
   */
  function setOverlay() {
    if (!overlay.includes("viewanime")) overlay = [...overlay, "viewanime"];
  }

  /**
   * Handles keyboard events, specifically closing the modal on 'Escape' key press.
   * @param {KeyboardEvent} { keyCode } - The keyboard event object.
   */
  function checkClose({ keyCode }) {
    if (keyCode === 27) close();
  }

  /**
   * Initiates playback for a given episode or the media itself.
   * If `episode` is provided, `playAnime` is called. Otherwise, `playMedia` is called.
   * @param {number | undefined} episode - The specific episode number to play (optional).
   */
  function play(episode) {
    if (episode || episode === 0) return playAnime(media, episode);
    if (media.status === "NOT_YET_RELEASED") return; // Prevent playing if not released.
    playMedia(media);
  }

  /**
   * Determines the appropriate text for the main play button based on the user's media list entry status.
   * @param {object} media - The media object.
   * @returns {string} The text for the play button.
   */
  function getPlayButtonText(media) {
    if (media?.mediaListEntry) {
      const { status, progress } = media.mediaListEntry;
      if (progress) {
        if (status === "COMPLETED") {
          return "Rewatch Now";
        } else {
          return "Continue Now";
        }
      }
    }
    return "Watch Now";
  }

  /**
   * Toggles the favorite status of the current media through the Anilist client.
   * Updates `media.isFavourite` reactively.
   */
  function toggleFavourite() {
    media.isFavourite = anilistClient.favourite({ id: media.id });
  }

  /**
   * Global event listener to close the view if no media is currently playing.
   * @listens window:overlay-check
   */
  window.addEventListener("overlay-check", (event) => {
    if (!event?.detail?.nowPlaying && media) close();
  });

  /**
   * Handles playing anime, either by setting it as the current view and then playing, or directly playing a torrent.
   * @param {number} id - The Anilist ID of the media.
   * @param {number | undefined} episode - The episode number to play.
   * @param {boolean} torrentOnly - If true, only handles torrent playback without changing the `$view`.
   */
  function handlePlay(id, episode, torrentOnly) {
    const cachedMedia = mediaCache.value[id];
    const cachedEpisode = episode || cachedMedia?.mediaListEntry?.progress;
    // Determine the desired episode: the explicit episode, or the next episode if progress exists.
    const desiredEpisode = episode
      ? episode
      : cachedEpisode && cachedEpisode !== 0
        ? cachedEpisode + 1
        : cachedEpisode;
    if (torrentOnly) {
      if (desiredEpisode) return playAnime(cachedMedia, desiredEpisode);
      if (cachedMedia?.status === "NOT_YET_RELEASED") return;
      playMedia(cachedMedia);
    } else {
      $view = cachedMedia; // Set the current view to the media being played.
      setTimeout(() => {
        play(desiredEpisode);
        IPC.emit("overlay-check"); // Notify other components that an overlay check is needed.
      }, 500);
    }
  }

  /**
   * IPC listener for playing anime.
   * @fires handlePlay
   * @listens IPC:play-anime
   */
  IPC.on("play-anime", (id, episode, torrentOnly) => {
    handlePlay(id, episode, torrentOnly);
  });

  /**
   * Window event listener for playing anime.
   * @fires handlePlay
   * @listens window:play-anime
   */
  window.addEventListener("play-anime", (event) => {
    const { id, episode, torrentOnly } = event.detail;
    handlePlay(id, episode, torrentOnly);
  });

  /**
   * Window event listener for playing torrents (adding a magnet link).
   * @listens window:play-torrent
   */
  window.addEventListener("play-torrent", (event) => {
    add(event.detail.magnet);
    IPC.emit("overlay-check");
  });

  /**
   * IPC listener for playing torrents.
   * @listens IPC:play-torrent
   */
  IPC.on("play-torrent", (magnet) => {
    add(magnet);
    IPC.emit("overlay-check");
  });

  /**
   * Synchronizes the height of the `rightColumn` with the `leftColumn`.
   * Used with `ResizeObserver` to maintain layout consistency.
   */
  function syncHeights() {
    if (leftColumn && rightColumn) {
      const leftHeight = leftColumn.offsetHeight;
      if (rightColumn.style.height !== `${leftHeight}px`) {
        rightColumn.style.height = `${leftHeight}px`;
      }
    }
  }
</script>

<div
  class="modal modal-full z-50"
  class:show={staticMedia}
  on:keydown={checkClose}
  tabindex="-1"
  role="button"
  bind:this={modal}
>
  <div
    class="h-full modal-content bg-dark p-0 overflow-y-auto position-relative"
    bind:this={container}
  >
    {#if staticMedia}
      <!-- Close button -->
      <button
        class="close pointer z-30 bg-dark-light top-20 right-0 position-fixed"
        type="button"
        use:click={() => close()}
      >
        &times;
      </button>

      <!-- Banner Image or Trailer -->
      {#if staticMedia?.trailer?.id}
        <!-- Auto-play trailer -->
        <div
          class="w-full cover-img anime-details position-absolute"
          style="height: 40vh; overflow: hidden;"
        >
          <!-- YouTube iframe with proper scaling -->
          <div style="position: relative; width: 100%; height: 100%;">
            <iframe
              src="https://www.youtube.com/embed/{staticMedia.trailer
                .id}?autoplay=1&mute=1&controls=0&loop=1&playlist={staticMedia
                .trailer.id}&modestbranding=1&rel=0&showinfo=0"
              class="absolute-center"
              frameborder="0"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowfullscreen
              style="
          position: absolute;
          top: 50%;
          left: 50%;
          width: 100vw;
          height: 56.25vw; /* 16:9 aspect ratio */
          min-height: 100vh;
          min-width: 177.77vh; /* 16:9 inverse */
          transform: translate(-50%, -50%);
        "></iframe>
          </div>
          <div
            style="
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              z-index: 5;
              background: linear-gradient(
                to bottom,
                rgba(0, 0, 0, 0.6) 0%,
                rgba(0, 0, 0, 0) 25%,
                rgba(0, 0, 0, 0) 60%,
                var(--dark-color) 99%
              );
              pointer-events: none;
              box-shadow: inset 0 0 20vh rgba(0, 0, 0, 0.7);
            "
          ></div>
        </div>
      {:else}
        <SmartImage
          class="w-full cover-img anime-details position-absolute"
          images={[
            staticMedia.bannerImage,
            () =>
              getKitsuMappings(staticMedia).then((metadata) => [
                metadata?.included?.[0]?.attributes?.coverImage?.original,
                metadata?.included?.[0]?.attributes?.coverImage?.large,
                metadata?.included?.[0]?.attributes?.coverImage?.small,
                metadata?.included?.[0]?.attributes?.coverImage?.tiny,
              ]),
            () =>
              getEpisodeMetadataForMedia(staticMedia).then(
                (metadata) => metadata?.[1]?.image,
              ),
          ]}
        />
      {/if}
      <div
        class="row px-20"
        style="margin-top: 10vh; position: relative; z-index: 10;"
      >
        <!-- Left Column: Cover, Title, Details, Synopsis, Tags, Genres, Relations, Recommendations -->
        <div class="col-lg-7 col-12 pb-10">
          <div bind:this={leftColumn}>
            <div
              class="d-flex flex-sm-row flex-column align-items-sm-end pb-20 mb-15"
            >
              <!-- Cover Image and Audio Label -->
              <div
                class="cover d-flex flex-row align-items-sm-end align-items-center justify-content-center mw-full mb-sm-0 mb-20 w-full"
                style="max-height: 50vh;"
              >
                <div class="position-relative h-full">
                  <SmartImage
                    class="rounded cover-img overflow-hidden h-full w-full"
                    color={media.coverImage.color || "var(--tertiary-color)"}
                    images={[
                      staticMedia.coverImage?.extraLarge,
                      staticMedia.coverImage?.medium,
                      "./404_cover.png",
                    ]}
                  />
                  <AudioLabel media={staticMedia} viewAnime={true} />
                </div>
              </div>
              <!-- Title, Stats, Play Button, Actions -->
              <div class="pl-sm-20 ml-sm-20">
                <h1
                  class="font-weight-very-bold text-white select-all mb-0 font-scale-40"
                  style="white-space: normal; overflow-wrap: break-word; line-height: 1.2;"
                >
                  {anilistClient.title(staticMedia)}
                </h1>
                <!-- Media Statistics (Rating, Format, Episodes/Length - CINEMA STYLE) -->
                <div class="d-flex flex-row font-size-18 flex-wrap mt-10 align-items-center" style="gap: 2rem; color: hsla(var(--white-color-hsl), 0.8);">
                  {#if staticMedia.averageScore}
                    <div
                      class="d-flex flex-row align-items-center"
                      title="{staticMedia.averageScore / 10} by {anilistClient.reviews(staticMedia)} reviews"
                    >
                      <Star class="mr-8 icon-shadow" size="1.8rem" fill="#ffd700" color="#ffd700" />
                      <span class="font-weight-very-bold text-white">
                        {staticMedia.averageScore}%
                      </span>
                    </div>
                  {/if}
                  {#if staticMedia.format}
                    <div class="d-flex flex-row align-items-center">
                      <span class="text-capitalize font-weight-bold">
                        {formatMap[staticMedia.format]}
                      </span>
                    </div>
                  {/if}
                  {#if staticMedia.episodes !== 1}
                    {@const maxEp = getMediaMaxEp(staticMedia)}
                    <div class="d-flex flex-row align-items-center">
                      <span class="font-weight-bold">
                        {maxEp && maxEp !== 0 ? maxEp : "?"} Ep
                      </span>
                    </div>
                  {:else if staticMedia.duration}
                    <div class="d-flex flex-row align-items-center">
                      <span class="font-weight-bold">
                        {staticMedia.duration} min
                      </span>
                    </div>
                  {/if}
                  <!-- Reviews hidden for cleaner look, or move to details -->
                </div>
                <!-- Play button and actions (Scoring, Favorite, Trailer, Share) -->
                <div class="d-flex flex-row flex-wrap play">
                  <button
                    class="btn btn-primary bg-white text-dark w-250 font-weight-bold shadow-none border-0 d-flex align-items-center justify-content-center mr-20 mt-20"
                    use:click={() => play()}
                    disabled={staticMedia.status === "NOT_YET_RELEASED"}
                  >
                    <Play class="mr-10" fill="currentColor" size="2rem" />
                    {playButtonText}
                  </button>
                  <div class="mt-20 d-flex">
                    {#if Helper.isAuthorized()}
                      <Scoring class="mr-10 " {media} viewAnime={true} />
                    {/if}
                    {#if Helper.isAniAuth()}
                      <button
                        class="btn btn-icon bg-dark-light text-white d-flex align-items-center justify-content-center shadow-none border-0 mr-10"
                        data-toggle="tooltip"
                        data-placement="top"
                        data-target-breakpoint="md"
                        data-title={media.isFavourite
                          ? "Unfavourite"
                          : "Favourite"}
                        use:click={toggleFavourite}
                        disabled={!Helper.isAniAuth()}
                      >
                        <div
                          class="favourite d-flex align-items-center justify-content-center"
                          title={media.isFavourite
                            ? "Unfavourite"
                            : "Favourite"}
                        >
                          <Heart
                            color={media.isFavourite
                              ? "#ff6b9d"
                              : "currentColor"}
                            fill={media.isFavourite ? "#ff6b9d" : "transparent"}
                            size="2rem"
                          />
                        </div>
                      </button>
                    {/if}
                    <ViewTrailer bind:overlay {staticMedia} />
                    <button
                      class="btn btn-icon bg-dark-light d-none align-items-center justify-content-center shadow-none border-0 mr-10"
                      class:d-flex={staticMedia.id}
                      data-toggle="tooltip"
                      data-placement="top"
                      data-target-breakpoint="md"
                      data-title="Share to Clipboard"
                      use:click={() =>
                        copyToClipboard(
                          `https://anilist.co/anime/${staticMedia.id}`,
                          "share URL",
                        )}
                      on:contextmenu|preventDefault={() =>
                        IPC.emit(
                          "open",
                          `https://anilist.co/anime/${staticMedia.id}`,
                        )}
                    >
                      <img
                        class="rounded w-20"
                        src="./anilist_icon.png"
                        alt="Anilist"
                      />
                    </button>
                    <button
                      class="btn btn-icon bg-dark-light d-none align-items-center justify-content-center shadow-none border-0"
                      class:d-flex={staticMedia.idMal}
                      data-toggle="tooltip"
                      data-placement="top"
                      data-target-breakpoint="md"
                      data-title="Share to Clipboard"
                      use:click={() =>
                        copyToClipboard(
                          `https://myanimelist.net/anime/${staticMedia.idMal}`,
                          "share URL",
                        )}
                      on:contextmenu|preventDefault={() =>
                        IPC.emit(
                          "open",
                          `https://myanimelist.net/anime/${staticMedia.idMal}`,
                        )}
                    >
                      <img
                        class="rounded w-20"
                        src="./myanimelist_icon.png"
                        alt="MyAnimeList"
                      />
                    </button>
                  </div>
                </div>
                <Following media={staticMedia} />
              </div>
            </div>
            <!-- Additional Details -->
            <Details media={staticMedia} alt={recommendations} />

            <!-- Tags Section -->
            <div
              bind:this={scrollTags}
              class="m-0 px-20 pb-0 pt-10 d-flex flex-wrap text-capitalize align-items-start"
            >
              {#each staticMedia.tags.slice(0, 7) as tag}
                <div class="genre-tag mb-10">
                  <Hash class="mr-5" size="1.4rem" /><span
                    class="font-weight-bolder select-all">{tag.name}</span
                  >
                </div>
              {/each}
              {#if staticMedia.tags.length > 7}
                <div
                  class="genre-tag mb-10 opacity-50"
                  data-toggle="tooltip"
                  data-placement="top"
                  data-title={staticMedia.tags
                    .slice(7)
                    .map((t) => t.name)
                    .join(", ")}
                >
                  +{staticMedia.tags.length - 7} more...
                </div>
              {/if}
            </div>
            <!-- Genres Section -->
            <!-- Genres Section -->
            <div
              bind:this={scrollGenres}
              class="m-0 px-20 pb-0 pt-10 d-flex flex-wrap text-capitalize align-items-start"
            >
              {#each staticMedia.genres as genre}
                <div
                  class="genre-tag select-all mb-10 genre-colored"
                  style="--genre-color: {genreColors[genre] || '#ffffff'};"
                >
                  <svelte:component
                    this={genreIcons[genre]}
                    class="mr-5"
                    size="1.4rem"
                  />
                  {genre}
                </div>
              {/each}
            </div>

            <!-- Synopsis Section -->
            {#if staticMedia.description}
              <div
                class="w-full d-flex flex-row align-items-center pt-20 mt-10"
              >
                <hr class="w-full" />
                <div
                  class="font-size-18 font-weight-semi-bold px-20 text-white"
                >
                  Synopsis
                </div>
                <hr class="w-full" />
              </div>
              <div class="font-size-16 pre-wrap pt-20 select-all">
                {staticMedia.description
                  ?.replace(/<[^>]*>/g, "")
                  ?.replace(/\.\.+(?=\s*$)/gm, ".") || ""}
              </div>
            {/if}

            <!-- Mobile Episode List Toggle (displayed on small screens) -->
            {#if episodeList?.length}
              <div
                class="w-full d-flex d-lg-none flex-row align-items-center pt-20 mt-10 pointer"
                aria-hidden="true"
                use:click={() => {
                  episodeOrder = !episodeOrder;
                }}
              >
                <hr class="w-full" />
                <div
                  class="position-absolute font-size-18 font-weight-semi-bold px-20 text-white"
                  style="left: 50%; transform: translateX(-50%);"
                >
                  Episodes
                </div>
                <hr class="w-full" />
                <div
                  class="ml-auto pl-20 font-size-12 more text-muted text-nowrap pr-20"
                  use:click={() => {
                    episodeOrder = !episodeOrder;
                  }}
                >
                  Reverse
                </div>
              </div>
            {/if}

            <!-- Mobile Episode List (displayed on small screens) -->
            <div class="col-lg-5 col-12 d-lg-none flex-column mt-20">
              <EpisodeList
                bind:episodeList
                mobileList={true}
                media={staticMedia}
                {episodeOrder}
                bind:userProgress
                bind:watched
                episodeCount={getMediaMaxEp(media)}
                {play}
                class="h-600"
              />
            </div>

            <!-- Relations and Recommendations -->
            <div class="d-lg-block">
              <!-- Relations List -->
              <ToggleList
                list={staticMedia.relations?.edges
                  ?.filter(
                    ({ node, relationType }) =>
                      relationType !== "CHARACTER" &&
                      node.type === "ANIME" &&
                      node.format !== "MUSIC" &&
                      !(settings.value.adult === "none" && node.isAdult) &&
                      !(
                        settings.value.adult !== "hentai" &&
                        node.genres?.includes("Hentai")
                      ) &&
                      !missingIds.includes(node.id),
                  )
                  .sort(
                    (a, b) =>
                      (a.node.seasonYear || Infinity) -
                      (b.node.seasonYear || Infinity),
                  )}
                promise={searchIDS}
                let:item
                let:promise
                title="Relations"
              >
                {#await promise}
                  <div class="small-card">
                    <SmallCardSk />
                  </div>
                {:then res}
                  {#if res}
                    <div class="small-card">
                      <SmallCard
                        data={item.node}
                        type={item.relationType
                          .replace(/_/g, " ")
                          .toLowerCase()}
                      />
                    </div>
                  {/if}
                {/await}
              </ToggleList>
              <!-- Recommendations List -->
              {#await recommendations then res}
                {@const media = res?.data?.Media}
                {#if media}
                  <ToggleList
                    list={media.recommendations?.edges
                      ?.filter(
                        ({ node }) =>
                          node.mediaRecommendation &&
                          !(
                            settings.value.adult === "none" &&
                            node.mediaRecommendation.isAdult
                          ) &&
                          !(
                            settings.value.adult !== "hentai" &&
                            node.mediaRecommendation.genres?.includes("Hentai")
                          ) &&
                          !missingIds.includes(node.mediaRecommendation.id),
                      )
                      .sort((a, b) => b.node.rating - a.node.rating)}
                    promise={searchIDS}
                    let:item
                    let:promise
                    title="Recommendations"
                  >
                    {#await promise}
                      <div class="small-card">
                        <SmallCardSk />
                      </div>
                    {:then res}
                      {#if res}
                        <div class="small-card">
                          <SmallCard
                            data={item.node.mediaRecommendation}
                            type={item.node.rating}
                          />
                        </div>
                      {/if}
                    {/await}
                  </ToggleList>
                {/if}
              {/await}
            </div>
          </div>
        </div>

        <!-- Right Column: Episode List (displayed on large screens) -->
        <div
          class="col-lg-5 col-12 d-none d-lg-flex flex-column pl-lg-20"
          bind:this={rightColumn}
        >
          <button
            class="close order pointer z-30 bg-dark-light position-absolute"
            class:d-none={!episodeList?.length}
            data-toggle="tooltip"
            data-placement="top"
            data-target-breakpoint="md"
            data-title="Reverse Episodes"
            use:click={() => {
              episodeOrder = !episodeOrder;
            }}
          >
            <svelte:component
              this={episodeOrder ? ArrowDown01 : ArrowUp10}
              size="2rem"
            />
          </button>
          <EpisodeList
            bind:episodeLoad
            media={staticMedia}
            {episodeOrder}
            bind:userProgress
            bind:watched
            episodeCount={getMediaMaxEp(media)}
            {play}
          />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Styling for the close button */
  .close {
    top: 5rem !important;
    left: unset !important;
    right: 3rem !important;
  }
  /* Styling for the episode order button */
  .order {
    top: 7rem !important;
    left: -5rem !important; /* Positioned relative to its parent column */
  }
  /* Default justify for play buttons (centered for small screens) */
  .play {
    justify-content: center;
  }
  /* Responsive adjustments for medium screens and up */
  @media (min-width: 577px) {
    .cover {
      max-width: 35% !important; /* Adjust cover image width */
    }
    .play {
      justify-content: left; /* Align play buttons to the left */
    }
  }
  /* Top padding for the main content row */
  .row {
    padding-top: 12rem !important;
  }
  /* Responsive adjustments for large screens and up */
  @media (min-width: 769px) {
    .row {
      padding: 0 10rem; /* Horizontal padding for wider screens */
    }
  }
  /* Aspect ratio for the cover image */
  .cover {
    aspect-ratio: 7/10;
  }

  /* ==========================================================================
     FULLBANNER STYLE PORT
     ========================================================================== */

  .btn-primary,
  .btn-secondary,
  .btn-icon {
    font-size: 1.5rem;
    border-radius: 0.8rem;
    transition: all 0.2s ease;
    min-height: 4.5rem;
  }

  /* Primary button (Watch Now) - bright and prominent */
  .btn-primary {
    box-shadow: 0 0.4rem 1.2rem hsla(var(--black-color-hsl), 0.4);
  }

  /* Glassmorphism buttons */
  .btn-secondary,
  .btn-icon {
    backdrop-filter: blur(1rem); /* ✨ Frosted glass effect */
    border: 0.1rem solid hsla(var(--white-color-hsl), 0.2) !important;
  }

  /* Square icon button */
  .btn-icon {
    width: 4.5rem;
    height: 4.5rem;
    padding: 0 !important;
  }

  /* Hover effects */
  @media (hover: hover) and (pointer: fine) {
    .btn-primary:hover {
      background: hsla(var(--white-color-hsl), 0.92) !important;
      transform: translateY(-0.3rem); /* 🎬 Lift effect */
      box-shadow: 0 0.6rem 1.8rem hsla(var(--black-color-hsl), 0.5);
    }

    .btn-secondary:hover {
      background: var(--dark-color-very-light) !important;
      transform: translateY(-0.3rem);
    }

    .btn-icon:hover {
      background: var(--dark-color-very-light) !important;
      transform: translateY(-0.3rem);
    }
  }

  /* Title Style Match */
  h1 {
    text-shadow: 0.2rem 0.4rem 1.2rem hsla(var(--black-color-hsl), 0.9);
  }

  /* GENRE TAGS STYLE PORT */
  /* GENRE TAGS STYLE PORT */
  .genre-tag {
    padding: 0.6rem 1.4rem;
    background: hsla(var(--white-color-hsl), 0.06); /* Reduced brightness */
    backdrop-filter: blur(1rem);
    border-radius: 2rem;
    font-size: 1.3rem;
    font-weight: 600;
    border: 0.1rem solid hsla(var(--white-color-hsl), 0.1);
    color: hsla(var(--white-color-hsl), 0.9);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    margin-right: 1rem;
    white-space: nowrap;
  }

  /* Specific styling for colored genres */
  .genre-colored {
    border-color: var(--genre-color);
    color: var(--genre-color);
    background: color-mix(in srgb, var(--genre-color) 8%, transparent);
  }

  @media (hover: hover) and (pointer: fine) {
    .genre-tag:hover {
      background: hsla(var(--white-color-hsl), 0.15);
      transform: translateY(-0.2rem);
      color: white;
      border-color: hsla(var(--white-color-hsl), 0.3);
    }

    .genre-colored:hover {
      background: color-mix(in srgb, var(--genre-color) 20%, transparent);
      color: var(--genre-color);
      border-color: var(--genre-color);
      box-shadow: 0 0 10px -5px var(--genre-color);
    }
  }

  /* ==========================================================================
     COVER ART ADJUSTMENTS
     ========================================================================== */
  /* Dim the cover image to avoid distraction in dark mode */
  :global(.cover-img) {
    filter: brightness(0.85) !important;
    box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.6) !important; /* Heavy dark shadow override */
    transition: filter 0.3s ease, box-shadow 0.3s ease;
  }

  :global(.cover-img:hover) {
    filter: brightness(1) !important;
    box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.7) !important;
  }
</style>
