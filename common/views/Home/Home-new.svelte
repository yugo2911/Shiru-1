<script context="module">
  import SectionsManager, { sections } from "@/modules/sections.js";
  import {
    anilistClient,
    currentSeason,
    currentYear,
  } from "@/modules/anilist.js";
  import { animeSchedule } from "@/modules/anime/animeschedule.js";
  import { settings } from "@/modules/settings.js";
  import { uniqueStore } from "@/modules/util.js";
  import equal from "fast-deep-equal/es6";
  import { RSSManager } from "@/modules/rss.js";
  import Helper from "@/modules/helper.js";
  import WPC from "@/modules/wpc.js";
  import { writable } from "simple-store-svelte";
  import Debug from "debug";
  const debug = Debug("ui:home");

  const bannerData = writable(getTitles());
  // Refresh banner every 15 minutes
  setInterval(() => getTitles(true), 5 * 60 * 1000);

  async function getTitles(refresh) {
    const res = anilistClient.search({
      method: "Search",
      ...(settings.value.adult === "hentai" && settings.value.hentaiBanner
        ? { genre: ["Hentai"] }
        : {}),
      sort: "TRENDING_DESC",
      perPage: 20,
      onList: false,
      ...(settings.value.adult !== "hentai" || !settings.value.hentaiBanner
        ? { season: currentSeason }
        : {}),
      year: currentYear,
      status_not: "NOT_YET_RELEASED",
    });
    if (refresh) {
      const renderData = await res;
      bannerData.set(Promise.resolve(renderData));
    } else return res;
  }

  let mappedSections = {};
  const manager = new SectionsManager();
  mapSections();
  WPC.listen("remap-sections", () => {
    manager.clear();
    mappedSections = {};
    mapSections();
  });

  function mapSections() {
    for (const section of sections.value)
      mappedSections[section.title] = section;
    for (const sectionTitle of settings.value.homeSections)
      manager.add(mappedSections[sectionTitle[0]]);
  }

  const continueWatching = "Continue Watching";
  const resolveData = async (data) =>
    Promise.all(
      data.map(async (item) => {
        const resolved =
          item.data && typeof item.data.then === "function"
            ? await item.data
            : item.data;
        const media = resolved?.media || resolved;
        return {
          ...item,
          data: media
            ? {
                id: media.id,
                idMal: media.idMal,
                title: media.title,
                bannerImage: media.bannerImage,
                isAdult: media.isAdult,
                duration: media.duration,
                episodes: media.episodes,
                format: media.format,
              }
            : resolved,
        };
      }),
    );
  if (Helper.getUser()) {
    refreshSections(
      Helper.getClient().userLists,
      ["Dubbed Releases", "Subbed Releases", "Hentai Releases"],
      true,
    );
    refreshSections(Helper.getClient().userLists, [
      continueWatching,
      "Sequels You Missed",
      "Stories You Missed",
      "Planning List",
      "Completed List",
      "Paused List",
      "Dropped List",
      "Watching List",
    ]);
  }
  if (Helper.isMalAuth())
    refreshSections(animeSchedule.subAiredLists, continueWatching); // When authorized with Anilist, this is already automatically handled.
  refreshSections(animeSchedule.dubAiredLists, continueWatching);
  function refreshSections(list, sections, schedule = false) {
    uniqueStore(list).subscribe(async (_value) => {
      const value = await _value;
      if (!value) return;
      for (const section of manager.sections) {
        // remove preview value, to force UI to re-request data, which updates it once in viewport
        if (
          sections.includes(section.title) &&
          !section.hide &&
          (!schedule || section.isSchedule)
        ) {
          const loaded = section.load(1, 20, section.variables);
          if (
            !section.preview.value ||
            !equal(
              await resolveData(loaded),
              await resolveData(section.preview.value),
            )
          )
            section.preview.value = loaded;
        }
      }
    });
  }

  // update AniSchedule 'Releases' feeds when a change is detected for the specified feed(s).
  WPC.listen("feedChanged", ({ updateFeeds, manifest }) => {
    for (const section of manager.sections) {
      try {
        if (section.isSchedule && updateFeeds.includes(section.title)) {
          animeSchedule
            .feedChanged(
              section.title.includes("Subbed")
                ? "Sub"
                : section.title.includes("Dubbed")
                  ? "Dub"
                  : "Hentai",
              false,
              true,
              manifest,
            )
            .then((changed) => {
              if (changed)
                section.preview.value = section.load(1, 20, section.variables);
            });
        }
      } catch (error) {
        debug(
          `Failed to update ${section.title} feed, this is likely a temporary connection issue:`,
          error,
        );
      }
    }
  });

  // force update RSS feed when the user adjusts a series in the FileManager.
  window.addEventListener("fileEdit", async () => {
    for (const section of manager.sections) {
      if (section.isRSS && !section.isSchedule) {
        const url = settings.value.rssFeedsNew.find(
          ([feedTitle]) => feedTitle === section.title,
        )?.[1];
        if (url) {
          const loaded = RSSManager.getMediaForRSS(1, 12, url, false, true);
          if (
            !section.preview.value ||
            !equal(
              await resolveData(loaded),
              await resolveData(section.preview.value),
            )
          )
            section.preview.value = loaded;
        }
      }
    }
  });

  const isPreviousRSS = (i) => {
    let index = i - 1;
    while (index >= 0) {
      if (!manager.sections[index]?.hide)
        return manager.sections[index]?.isRSS ?? false;
      else if (index - 1 >= 0 && manager.sections[index - 1]?.isRSS)
        return true;
      index--;
    }
    return false;
  };
</script>

<script>
  import Section from "@/views/Home/Section.svelte";
  import Banner from "@/components/banner/Banner.svelte";

  let activeSection = null;
  /* Helper to determine color for a section title */
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

  function getPillColor(title) {
    if (title === "Home") return "#ffffff";
    for (const [genre, color] of Object.entries(genreColors)) {
      if (title.includes(genre)) return color;
    }
    // Default fallback colors based on keywords
    if (title.includes("Dub")) return "#ff9f43";
    if (title.includes("Sub")) return "#54a0ff";
    if (title.includes("Popular")) return "#ff7675";
    if (title.includes("Trending")) return "#55efc4";
    return "#ffffff"; // Default white
  }
</script>

<div class="h-full w-full overflow-y-scroll root overflow-x-hidden">
  <Banner data={$bannerData} />

  <div class="d-flex flex-column h-full w-full mt-10">
    <!-- Section Switcher / Filter Menu -->
    <div class="section-menu px-20 mb-20 d-flex flex-wrap align-items-center">
      <button
        class="section-pill mr-10 mb-10"
        class:active={activeSection === null}
        on:click={() => (activeSection = null)}
        on:keydown={(e) => e.key === "Enter" && (activeSection = null)}
        style="--pill-color: #ffffff;"
      >
        Home
      </button>
      {#each manager.sections as section, i}
        {#if !section.hide}
          {@const color = getPillColor(section.title)}
          <button
            class="section-pill mr-10 mb-10"
            class:active={activeSection === i}
            on:click={() => (activeSection = i)}
            on:keydown={(e) => e.key === "Enter" && (activeSection = i)}
            style="--pill-color: {color};"
          >
            {section.title}
          </button>
        {/if}
      {/each}
    </div>

    <!-- Active Content Area -->
    <div class="content-area w-full">
      {#if activeSection === null}
        <!-- DASHBOARD VIEW: Shows ALL Sections as Horizontal Lists -->
        {#each manager.sections as section, i}
          {#if !section.hide}
            <div
              class="px-20 mb-10 font-scale-24 font-weight-bold text-white d-flex align-items-center pointer section-header-link"
              on:click={() => (activeSection = i)}
              on:keydown={(e) => e.key === "Enter" && (activeSection = i)}
            >
              {section.title}
              <span class="ml-10 font-size-14 text-muted font-weight-normal"
                >See All ></span
              >
            </div>
            <Section
              bind:opts={section}
              lastEpisode={isPreviousRSS(i)}
              grid={false}
            />
          {/if}
        {/each}
      {:else}
        <!-- FOCUSED SECTION VIEW -->
        {#if manager.sections[activeSection]}
          <Section bind:opts={manager.sections[activeSection]} grid={true} />
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .section-menu {
    gap: 0.5rem;
    position: sticky;
    top: 0;
    z-index: 100;
    background: linear-gradient(
      to bottom,
      var(--bg-dark) 80%,
      transparent
    ); /* Fade out at bottom */
    padding-top: 1rem;
    padding-bottom: 1rem;
    margin-bottom: 2rem !important;
  }

  .section-header-link:hover {
    opacity: 0.8;
  }

  .section-pill {
    /* Base Glassmorphism */
    background: color-mix(in srgb, var(--pill-color) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--pill-color) 30%, transparent);
    color: var(--pill-color);
    padding: 0.6rem 1.6rem;
    border-radius: 2rem;
    font-size: 1.3rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
    backdrop-filter: blur(8px);
    text-transform: capitalize;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .section-pill:hover {
    background: color-mix(in srgb, var(--pill-color) 20%, transparent);
    border-color: var(--pill-color);
    transform: translateY(-2px);
    box-shadow: 0 6px 12px
      color-mix(in srgb, var(--pill-color) 15%, transparent);
    text-shadow: 0 0 10px color-mix(in srgb, var(--pill-color) 50%, transparent);
  }

  .section-pill.active {
    background: var(--pill-color);
    color: black; /* Or white depending on brightness, but usually black text on bright genre colors is safer, or white on dark */
    border-color: var(--pill-color);
    box-shadow: 0 0 15px color-mix(in srgb, var(--pill-color) 60%, transparent);
  }

  /* Fix text color for active state if color is dark/light? 
     Most genre colors are pastel/bright, so black text is often good, 
     but let's try white text with text-shadow for better contrast or keep user request aesthetic */
  .section-pill.active {
    color: #000000;
    font-weight: 800;
  }

  /* Remove section header if in grid mode and single section */
  .content-area :global(.position-relative) {
    margin-bottom: 2rem;
  }
</style>
