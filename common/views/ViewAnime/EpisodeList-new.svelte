<script context="module">
  import { animeSchedule } from "@/modules/anime/animeschedule.js";
  import { malDubs } from "@/modules/anime/animedubs.js";
  import { settings } from "@/modules/settings.js";
  import { SUPPORTS } from "@/modules/support.js";
  import { createListener, past } from "@/modules/util.js";

  const { reactive, init } = createListener(["torrent-button"]);
  init(true);

  async function dubbedEpisode(i, media) {
    if (!settings.value.cardAudio) return;
    const episode = i + 1;
    const entry = (await animeSchedule.dubAiringLists.value)?.find(
      (entry) => entry.media?.media?.id === media.id,
    );
    const episodeEntry = (await animeSchedule.dubAiredLists.value)?.find(
      (entry) => entry?.id === media.id && entry?.episode?.aired === episode,
    );
    if (entry && !episodeEntry) {
      const airingSchedule =
        entry?.media?.media?.airingSchedule?.nodes[episode - 1] ||
        entry?.media?.media?.airingSchedule?.nodes.find(
          (entry) => entry.episode === episode,
        ) ||
        entry?.airingSchedule?.media?.media?.nodes[0];
      const delayed = !!(
        entry.episodeDate &&
        ((new Date(entry.delayedUntil) >= new Date(entry.episodeDate) &&
          (new Date(entry.delayedFrom) > new Date(entry.episodeDate) ||
            new Date(entry.delayedUntil).getTime() ===
              new Date(entry.episodeDate).getTime() ||
            (new Date(entry.delayedFrom) <= new Date(entry.episodeDate) &&
              entry.episodeNumber ===
                entry.media?.media?.airingSchedule?.nodes[0].episode &&
              new Date(entry.delayedUntil).getTime() ===
                new Date(
                  entry.media?.media?.airingSchedule?.nodes[0].airingAt,
                ).getTime())) &&
          new Date(entry.delayedUntil) > new Date()) ||
          entry.delayedIndefinitely)
      );
      const numberOfEpisodes = entry?.subtractedEpisodeNumber
        ? entry.episodeNumber - entry.subtractedEpisodeNumber
        : 1;
      if (entry.episodeDate && entry.episodeNumber <= episode) {
        return {
          airdate: past(
            new Date(delayed ? entry.delayedUntil : entry.episodeDate),
            entry.episodeNumber >= episode ? 0 : episode - entry.episodeNumber,
            true,
          ),
          text: `${entry.delayedIndefinitely ? "Suspended" : entry.delayedIndefinitely ? "Not Planned" : episode > entry.episodeNumber && numberOfEpisodes > 4 && !entry.unaired ? "In Production" : since(past(new Date(delayed ? entry.delayedUntil : entry.episodeDate), entry.episodeNumber >= episode ? 0 : episode - entry.episodeNumber, true)) + (delayed ? ` (${entry.delayedText || "Delayed"})` : "")}`,
          delayed: delayed,
        };
      } else if (airingSchedule && airingSchedule.episode <= episode) {
        return {
          airdate: airingSchedule.airingAt,
          text: `${since(new Date(airingSchedule.airingAt))} ${delayed ? `(${entry.delayedText || "Delayed"})` : ""}`,
          delayed: delayed && !entry.delayedIndefinitely,
        };
      } else {
        return {
          airdate: new Date().toISOString(),
          text: `Finished`,
          delayed: false,
        };
      }
    } else if (episodeEntry) {
      return {
        airdate: episodeEntry.episode.airedAt,
        text: `${since(new Date(episodeEntry.episode.airedAt))}`,
        delayed: false,
      };
    } else if (
      (await malDubs.dubLists.value)?.incomplete?.includes(media.idMal) &&
      (await animeSchedule.dubAiredLists.value).find(
        (entry) => entry?.id === media.id && entry?.episode?.aired === 1,
      )
    ) {
      return { text: `Not Planned`, delayed: true, notPlanned: true };
    } else if (
      !entry &&
      !episodeEntry &&
      media.seasonYear >= new Date().getFullYear() &&
      (await malDubs.isDubMedia(media))
    ) {
      return { text: `In Production`, delayed: false };
    }
  }
</script>

<script>
  import {
    loadedTorrent,
    completedTorrents,
    seedingTorrents,
    stagingTorrents,
  } from "@/modules/torrent.js";
  import { since, monthDay, matchPhrase, capitalize } from "@/modules/util.js";
  import { click } from "@/modules/click.js";
  import { onMount, onDestroy } from "svelte";
  import { episodeByAirDate } from "@/modules/extensions/handler.js";
  import { liveAnimeProgress } from "@/modules/anime/animeprogress.js";
  import { getHash } from "@/modules/anime/animehash.js";
  import { episodesList } from "@/modules/episodes.js";
  import {
    getAniMappings,
    hasZeroEpisode,
    durationMap,
  } from "@/modules/anime/anime.js";
  import EpisodeListSk from "@/components/skeletons/EpisodeListSk.svelte";
  import TorrentButton from "@/components/TorrentButton.svelte";
  import AudioLabel from "@/views/ViewAnime/AudioLabel.svelte";
  import SmartImage from "@/components/visual/SmartImage.svelte";

  export let media;

  export let episodeOrder = true;

  export let watched = false;

  export let episodeCount;

  export let userProgress = 0;

  export let play;

  export let episodeLoad = null;

  export let mobileList = false;

  export let episodeList = [];

  let mobileWaiting = null;

  $: id = media.id;
  $: idMal = media.idMal;
  $: duration = media.duration;

  const episodeRx = /Episode (\d+) - (.*)/;
  const animeProgress = liveAnimeProgress(id);

  let loadScroll = false;
  let maxEpisodes = 15;
  let currentEpisodes = [];
  function handleScroll(event) {
    const container = event.target;
    if (
      currentEpisodes.length !== episodeList.length &&
      container.scrollTop + container.clientHeight + 80 >=
        container.scrollHeight
    ) {
      loadScroll = true;
      const nextBatch = (
        episodeOrder ? episodeList : [...episodeList]?.reverse()
      )?.slice(currentEpisodes.length, currentEpisodes.length + maxEpisodes);
      currentEpisodes = [...new Set([...currentEpisodes, ...nextBatch])];
    }
  }

  async function load() {
    const mappings = (await getAniMappings(id)) || {};
    const { episodes, specialCount, episodeCount: newEpisodeCount } = mappings;

    /** @type {{ zeroEpisode: object; airingAt: number; episode: number; filler?: boolean; dubAiring?: object; }[]} */
    episodeList = Array.from(
      {
        length: newEpisodeCount > episodeCount ? newEpisodeCount : episodeCount,
      },
      (_, i) => ({
        episode: i + 1,
        image: null,
        summary: null,
        rating: null,
        title: null,
        length: null,
        airdate: null,
        airingAt: null,
        filler: episodesList.getSingleEpisode(idMal, i + 1),
        dubAiring: dubbedEpisode(i, media),
      }),
    );
    let alEpisodes = episodeList;

    // fallback: pull episodes from airing schedule if anime doesn't have expected episode count
    if (
      !(
        media.episodes &&
        media.episodes === newEpisodeCount &&
        media.status === "FINISHED"
      )
    ) {
      const settled = media.airingSchedule;
      if (settled?.length >= newEpisodeCount) {
        alEpisodes = settled.map((episode, i) => ({
          ...episode,
          airingAt: episode.airingAt,
          episode: episode.episode,
          filler: episodesList.getSingleEpisode(idMal, i + 1),
          dubAiring: dubbedEpisode(i, media),
        }));
      } else if (settled?.length) {
        const settledMap = settled.reduce((acc, { airingAt, episode }) => {
          acc[episode] = { airingAt, episode };
          return acc;
        }, {});
        alEpisodes = alEpisodes.map((episode, i) => {
          const settledData = settledMap?.[episode.episode];
          if (settledData)
            return {
              ...episode,
              airingAt: settledData.airingAt ?? episode.airingAt,
              episode: settledData.episode ?? episode.episode,
              filler: episodesList.getSingleEpisode(idMal, i + 1),
              dubAiring: dubbedEpisode(i, media),
            };
          return episode;
        });
      }
    }

    if (
      alEpisodes.length < episodeCount ||
      (!alEpisodes.length && !episodeCount)
    ) {
      const eps = await episodesList.getEpisodeData(idMal);
      if (eps?.length > 0) {
        const lastId = eps[eps.length - 1].episode_id;
        alEpisodes = Array.from({ length: lastId }, (_, i) => ({
          episode: i + 1,
          image: null,
          summary: null,
          rating: null,
          title: (lastId <= 100
            ? eps.find((e) => e.episode_id === i + 1)
            : episodesList.getSingleEpisode(idMal, i + 1)
          )?.title,
          length: null,
          airdate: null,
          airingAt: (lastId <= 100
            ? eps.find((e) => e.episode_id === i + 1)
            : episodesList.getSingleEpisode(idMal, i + 1)
          )?.aired,
          filler: episodesList.getSingleEpisode(idMal, i + 1),
          dubAiring: dubbedEpisode(i, media),
        }));
      } else if (
        media?.status === "RELEASING" ||
        media?.status === "FINISHED"
      ) {
        alEpisodes = Array.from(
          {
            length:
              media?.mediaListEntry?.progress > 0
                ? media?.mediaListEntry?.progress
                : 1,
          },
          (_, i) => ({
            episode: i + 1,
            image: null,
            summary: null,
            rating: null,
            title: null,
            length: null,
            airdate: null,
            airingAt: null,
            filler: episodesList.getSingleEpisode(idMal, i + 1),
            dubAiring: dubbedEpisode(i, media),
          }),
        );
      }
    }

    let lastValidAirDate = null;
    let lastDuration = durationMap[media?.format];
    let zeroAsFirstEpisode;
    const zeroEpisode = await hasZeroEpisode(media, mappings);
    const kitsuMappings = await episodesList.getKitsuEpisodes(media.id);
    if (zeroEpisode)
      alEpisodes.unshift({
        episode: 0,
        title: zeroEpisode[0].title,
        airingAt:
          media.airingSchedule?.nodes?.find((node) => node.episode === 1)
            ?.airingAt || zeroEpisode[0].airingAt,
        filler: episodesList.getSingleEpisode(idMal, 0),
        dubAiring: dubbedEpisode(0, media),
      });
    for (const {
      episode,
      title: oldTitle,
      airingAt,
      filler,
      dubAiring,
    } of alEpisodes?.length
      ? alEpisodes
      : [
          {
            episode: 1,
            title: null,
            airingAt: null,
            filler: null,
            dubAiring: null,
          },
        ]) {
      const airingPromise = await airingAt;
      const alDate =
        airingPromise &&
        new Date(
          typeof airingPromise === "number"
            ? (airingPromise || 0) * 1000
            : airingPromise || 0,
        );

      // validate by air date if the anime has specials AND doesn't have matching episode count
      const needsValidation = !(
        !specialCount ||
        (media.episodes &&
          media.episodes === newEpisodeCount &&
          episodes &&
          episodes[Number(episode)])
      );
      const {
        image,
        summary,
        overview,
        rating,
        title: newTitle,
        length,
        airdate,
      } = needsValidation
        ? episodeByAirDate(null, episodes, episode)
        : (episodes && episodes[Number(episode)]) || {};
      const kitsuEpisode = kitsuMappings?.data?.find(
        (ep) => ep?.attributes?.number === episode,
      )?.attributes;
      const streamingTitle =
        !media.streamingEpisodes?.find(
          (ep) =>
            episodeRx.exec(ep.title) &&
            Number(episodeRx.exec(ep.title)[1]) === media?.episodes + 1,
        ) &&
        media.streamingEpisodes?.find(
          (ep) =>
            episodeRx.exec(ep.title) &&
            Number(episodeRx.exec(ep.title)[1]) === episode &&
            episodeRx.exec(ep.title)[2] &&
            !episodeRx
              .exec(ep.title)[2]
              .toLowerCase()
              .trim()
              .startsWith("episode"),
        );
      const streamingThumbnail = media.streamingEpisodes?.find(
        (ep) =>
          episodeRx.exec(ep.title) &&
          Number(episodeRx.exec(ep.title)[1]) === episode,
      )?.thumbnail;
      const title =
        episode === 0
          ? oldTitle
          : newTitle?.en ||
            oldTitle?.en ||
            (await episodesList.getSingleEpisode(idMal, episode))?.title ||
            episodeRx.exec(streamingTitle?.title)?.[2];
      lastDuration = length || duration || lastDuration;

      // fix any weird dates when maintainers are lazy.
      const scheduledEntry = media?.airingSchedule?.nodes.find(
        (entry) => entry.episode === episode + (zeroEpisode ? 1 : 0),
      );
      const scheduledDate = scheduledEntry
        ? new Date(scheduledEntry.airingAt * 1000)
        : null;
      let validatedAiringAt = lastValidAirDate
        ? scheduledDate >= lastValidAirDate ||
          (scheduledDate?.getDate() >= lastValidAirDate.getDate() &&
            scheduledDate?.getMonth() >= lastValidAirDate.getMonth() &&
            scheduledDate?.getFullYear() >= lastValidAirDate.getFullYear())
          ? scheduledDate
          : null
        : scheduledDate;
      if (!validatedAiringAt) {
        const fallbackAirDate = airdate ? new Date(airdate) : null;
        validatedAiringAt = lastValidAirDate
          ? (alDate || fallbackAirDate) >= lastValidAirDate ||
            ((alDate || fallbackAirDate)?.getDate() >=
              lastValidAirDate.getDate() &&
              (alDate || fallbackAirDate)?.getMonth() >=
                lastValidAirDate.getMonth() &&
              (alDate || fallbackAirDate)?.getFullYear() >=
                lastValidAirDate.getFullYear())
            ? alDate || fallbackAirDate
            : null
          : alDate || fallbackAirDate;
        if (validatedAiringAt) {
          lastValidAirDate = validatedAiringAt;
        }
      } else {
        lastValidAirDate = validatedAiringAt;
      }

      // fix for when multi-header sub releases aren't properly updated on Anilist, but the exact same dub multi-header release exists. Should prevent any episodes being marked unreleased if a dub clearly exists for it, therefore the sub exists.
      let _dubAiring = dubAiring;
      if (_dubAiring && validatedAiringAt && media.status !== "FINISHED") {
        _dubAiring = await dubAiring;
        if (
          _dubAiring?.airdate &&
          new Date(_dubAiring.airdate).getTime() <
            new Date(validatedAiringAt).getTime()
        )
          validatedAiringAt = _dubAiring.airdate;
      }

      let zeroSummary;
      if (episode === 0) {
        // might get lucky and randomly find the zero episode from anilist mappings
        const findZeroEpisode = (title, data) => {
          for (const route in data)
            if (matchPhrase(data[route]?.title?.en, title, 0.4))
              return data[route];
          return null;
        };
        const zeroEpisode = findZeroEpisode(title, mappings?.episodes);
        zeroSummary =
          zeroEpisode?.summary ||
          zeroEpisode?.[0]?.summary ||
          zeroEpisode?.overview ||
          zeroEpisode?.[0]?.overview ||
          "This is a zero episode which means a prequel, prologue or a teaser which may be important to the story.";
        lastDuration =
          zeroEpisode?.length || zeroEpisode?.[0]?.length || lastDuration;
      }
      if (
        zeroEpisode &&
        episode === 1 &&
        /episode\s*0/i.test(
          title ||
            kitsuEpisode?.titles?.en_us ||
            kitsuEpisode?.titles?.en_jp ||
            newTitle?.jp ||
            oldTitle?.jp,
        )
      ) {
        zeroAsFirstEpisode = true;
        continue; // skip setting this episode as it's Episode 0
      }

      const episodeNumber = episode - (zeroAsFirstEpisode ? 1 : 0);
      episodeList[episodeNumber - (!zeroEpisode ? 1 : 0)] = {
        zeroEpisode,
        episode: episodeNumber,
        image:
          media?.status === "FINISHED" ||
          (validatedAiringAt &&
            new Date(validatedAiringAt).getTime() <=
              Date.now() + 7 * 24 * 60 * 60 * 1000)
            ? episode === 0
              ? zeroEpisode[0]?.thumbnail
              : episodeList.some(
                    (ep) =>
                      ep.image ===
                        (image ||
                          kitsuEpisode?.thumbnail?.original ||
                          streamingThumbnail) && ep.episode !== episodeNumber,
                  )
                ? null
                : image ||
                  kitsuEpisode?.thumbnail?.original ||
                  streamingThumbnail
            : null,
        summary:
          media?.status === "FINISHED" ||
          (validatedAiringAt &&
            new Date(validatedAiringAt).getTime() <= Date.now()) ||
          ((episode === 0 || episode === 1) &&
            !validatedAiringAt &&
            media?.status === "RELEASING")
            ? episode === 0
              ? zeroSummary || summary || overview
              : episodeList.some(
                    (ep) =>
                      ep.summary ===
                        (summary ||
                          overview ||
                          kitsuEpisode?.synopsis ||
                          kitsuEpisode?.description) &&
                      ep.episode !== episodeNumber,
                  )
                ? null
                : summary ||
                  overview ||
                  kitsuEpisode?.synopsis ||
                  kitsuEpisode?.description
            : `This episode ${validatedAiringAt || media?.startDate?.month || media?.season || media?.seasonYear ? `will be released ${validatedAiringAt || media?.startDate?.month ? `${validatedAiringAt ? `on` : `in`} ${monthDay(validatedAiringAt || new Date(media.startDate.year, media.startDate.month, media.startDate.day), !validatedAiringAt)}` : `in ${media?.season ? capitalize(media?.season?.toLowerCase()) : ""} ${media?.seasonYear || ""}`}.` : ` is in production and does not have an estimated release date.`}`,
        rating,
        title:
          media?.status === "FINISHED" ||
          (validatedAiringAt &&
            new Date(validatedAiringAt).getTime() <=
              Date.now() + 7 * 24 * 60 * 60 * 1000)
            ? title ||
              kitsuEpisode?.titles?.en_us ||
              kitsuEpisode?.titles?.en_jp ||
              newTitle?.jp ||
              oldTitle?.jp
            : null,
        length:
          media?.status === "FINISHED" || validatedAiringAt
            ? lastDuration
            : null,
        airdate: validatedAiringAt,
        airingAt: validatedAiringAt,
        filler,
        dubAiring: _dubAiring,
      };
    }

    if (zeroEpisode && episodeList.length === alEpisodes.length)
      episodeList = episodeList.slice(0, -1);
    currentEpisodes = episodeList?.slice(0, maxEpisodes);
    return episodeList && episodeList?.length > 0 ? episodeList : null;
  }

  $: if (media) {
    episodeList = [];
    episodeOrder = true;
    currentEpisodes = [];
    mobileWaiting = null;
    loadScroll = false;
    if (!mobileList) episodeLoad = load();
  }

  $: {
    if (episodeOrder) currentEpisodes = episodeList?.slice(0, maxEpisodes);
    else currentEpisodes = [...episodeList]?.reverse()?.slice(0, maxEpisodes);
  }

  let container;
  $: if (id && container) container.scrollTo({ top: 0, behavior: "smooth" });
  function renderVisible() {
    if (
      !container ||
      container.scrollHeight === 0 ||
      container.clientHeight === 0
    )
      return;
    if (
      currentEpisodes.length !== episodeList.length &&
      !(container.scrollHeight > container.clientHeight)
    ) {
      const nextBatch = (
        episodeOrder ? episodeList : [...episodeList]?.reverse()
      )?.slice(currentEpisodes.length, currentEpisodes.length + maxEpisodes);
      currentEpisodes = [...new Set([...currentEpisodes, ...nextBatch])];
    }
  }

  function mobileWait(condition, interval = 1000) {
    if (mobileWaiting) return mobileList ? mobileWaiting : null;
    mobileWaiting = new Promise((resolve) => setTimeout(resolve, 1000));
    mobileWaiting = new Promise((resolve) => {
      const check = () => {
        if (mobileWaiting) {
          if (condition()) resolve();
          else setTimeout(check, interval);
        }
      };
      check();
    });
    return mobileWaiting;
  }

  onMount(() => {
    setInterval(() => {
      if (!mobileList && episodeList?.length > maxEpisodes) renderVisible();
    }, 100);
  });

  onDestroy(() => {
    mobileWaiting = null;
    episodeList = [];
    episodeLoad = null;
  });
</script>

<div
  bind:this={container}
  class="episode-list episode-grid overflow-y-auto overflow-x-hidden {$$restProps.class}"
  on:scroll={handleScroll}
>
  {#await episodeLoad || mobileWait(() => episodeList?.length > 0 || !episodeList)?.then(() => episodeList)}
    {#each Array.from( { length: media?.status !== "NOT_YET_RELEASED" ? Math.max(Math.min(episodeCount || 0, maxEpisodes), 1) : 1 }, ) as _}
      <div
        class="w-full px-20 my-20 content-visibility-auto scale h-150"
        class:h-165={SUPPORTS.isAndroid}
      >
        <EpisodeListSk />
      </div>
    {/each}
  {:then _}
    {#if episodeList}
      {#each currentEpisodes as { zeroEpisode, episode, image, summary, rating, title, length, airdate, filler, dubAiring }, index}
        {#await Promise.all( [title, filler, dubAiring, currentEpisodes[episodeOrder ? index - 1 : index + 1]?.dubAiring], )}
          {#each Array.from( { length: Math.min(episodeCount || 0, maxEpisodes) }, ) as _, index}
            <div
              class="w-full px-20 content-visibility-auto scale h-150"
              class:h-165={SUPPORTS.isAndroid}
              class:my-20={!mobileList || index !== 0}
            >
              <EpisodeListSk />
            </div>
          {/each}
        {:then [title, filler, dubAiring, nextDubAiring]}
          {#if media?.status === "FINISHED" || (episodeOrder ? index === 0 || (currentEpisodes[index - 1]?.airdate && new Date(currentEpisodes[index - 1].airdate).getTime() <= new Date().getTime()) || (media?.status !== "NOT_YET_RELEASED" && airdate && currentEpisodes[index - 1]?.airdate && currentEpisodes[index - 1]?.airdate === airdate) || (nextDubAiring?.airdate && new Date(nextDubAiring.airdate).getTime() === new Date(dubAiring.airdate).getTime()) : index === currentEpisodes.length - 1 || (currentEpisodes[index + 1]?.airdate && new Date(currentEpisodes[index + 1]?.airdate).getTime() <= new Date().getTime()) || (currentEpisodes[index + 1]?.airdate && currentEpisodes[index + 1]?.airdate === airdate) || (nextDubAiring?.airdate && new Date(nextDubAiring.airdate).getTime() === new Date(dubAiring.airdate).getTime()))}
            {@const unreleased =
              media?.status !== "FINISHED" &&
              ((airdate && new Date(airdate).getTime() > new Date()) ||
                (!airdate && media?.status === "NOT_YET_RELEASED"))}
            {@const completed =
              !watched && userProgress >= episode + (zeroEpisode ? 1 : 0)}
            {@const target =
              userProgress + 1 === episode + (zeroEpisode ? 1 : 0)}
            {@const hasFiller = filler?.filler || filler?.recap}
            {@const progress =
              !watched &&
              ($animeProgress?.[episode + (zeroEpisode ? 1 : 0)] ?? 0)}
            {@const resolvedTitle = episodeList
              .filter((ep) => ep.episode < episode)
              .some((ep) => matchPhrase(ep.title, title, 0.1, true))
              ? null
              : title}
            {@const resolvedHash =
              ($completedTorrents ||
                $seedingTorrents ||
                $stagingTorrents ||
                $loadedTorrent) &&
              getHash(
                media?.id,
                { episode, client: true, batchGuess: true },
                false,
                true,
              )}
            <div
              class="episode-card-wrapper content-visibility-auto"
              class:load-in={!loadScroll}
            >
              <div
                class="cinema-card rounded-2 w-full h-full overflow-hidden position-relative {unreleased
                  ? `unreleased not-allowed`
                  : `pointer`}"
                class:not-reactive={!$reactive}
                class:completed
                class:target
                use:click={() => play(episode)}
              >
                <!-- CARD LAYER 1: Background Image -->
                <div class="h-full w-full bg-dark position-absolute">
                  {#if image}
                    <SmartImage
                      class="img-cover h-full w-full cinema-image"
                      images={[image, "./404_episode.png"]}
                    />
                  {:else}
                    <div
                      class="h-full w-full d-flex align-items-center justify-content-center bg-dark-light"
                    >
                      <span class="text-muted font-weight-bold">No Preview</span
                      >
                    </div>
                  {/if}
                </div>

                <!-- LAYER 2: Gradient Overlay (Top & Bottom) -->
                <div class="cinema-overlay position-absolute h-full w-full" />

                <!-- Unreleased Overlay Pattern -->
                <div
                  class="unreleased-overlay position-absolute inset-0 h-full w-full pointer-events-none"
                  class:d-none={!unreleased}
                />

                <!-- LAYER 3: Interactive Elements (Top Right) -->
                <div
                  class="position-absolute top-0 right-0 p-10 d-flex flex-column align-items-end z-2"
                >
                  <!-- Torrent Button -->
                  {#if resolvedHash}
                    <div
                      class="text-danger icon-shadow mb-5 torrent-btn-wrapper"
                    >
                      <TorrentButton
                        class="btn btn-square shadow-none bg-transparent bd-highlight h-40 w-40"
                        hash={[resolvedHash]}
                        search={{ media, episode }}
                        size={"3rem"}
                        strokeWidth={"2.3"}
                      />
                    </div>
                  {/if}

                  <!-- Play Button (Appears on Hover) -->
                  <div
                    class="play-icon-wrapper rounded-circle bg-primary text-white d-flex align-items-center justify-content-center"
                  >
                    <!-- Simple Play Triangle (CSS or Icon) -->
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      width="24"
                      height="24"><path d="M8 5v14l11-7z" /></svg
                    >
                  </div>
                </div>

                <!-- LAYER 4: Content Overlay (Bottom) -->
                <div
                  class="cinema-content position-absolute bottom-0 w-full p-15 d-flex flex-column justify-content-end"
                >
                  <!-- Badges Row -->
                  <div class="d-flex align-items-center mb-5 gap-5">
                    {#if hasFiller}
                      <span
                        class="badge badge-warning text-dark font-weight-bold"
                      >
                        {filler?.filler ? "Filler" : "Recap"}
                      </span>
                    {/if}
                    {#if dubAiring}
                      <span
                        class="badge {dubAiring.delayed
                          ? 'badge-danger'
                          : 'badge-success'} text-dark font-weight-bold"
                      >
                        Dub: {dubAiring.text}
                      </span>
                    {/if}
                  </div>

                  <!-- Title & Episode Info -->
                  <div class="d-flex align-items-end justify-content-between">
                    <div class="overflow-hidden">
                      <div
                        class="font-size-24 font-weight-very-bold text-white line-height-1 mb-5 text-shadow"
                      >
                        {episode < 10 ? `0${episode}` : episode}
                      </div>
                      <div
                        class="font-size-14 font-weight-bold text-light line-1 text-shadow"
                      >
                        {#if resolvedTitle && !new RegExp(`(?<![\\d.])${episode}(?![\\d.])`).test(resolvedTitle)}
                          {resolvedTitle}
                        {:else}
                          Episode {episode}
                        {/if}
                      </div>
                    </div>
                    {#if length}
                      <div
                        class="font-size-12 text-muted font-weight-bold ml-10 text-nowrap"
                      >
                        {length}m
                      </div>
                    {/if}
                  </div>

                  <!-- Dates/Status when unreleased -->
                  {#if unreleased}
                    <div class="font-size-12 text-accent mt-5 font-weight-bold">
                      {#if airdate}
                        Available {since(new Date(airdate))}
                      {:else}
                        TBA
                      {/if}
                    </div>
                  {/if}
                </div>

                <!-- LAYER 5: Progress Bar (Very Bottom) -->
                {#if completed}
                  <div
                    class="progress-line completed w-full position-absolute bottom-0 left-0"
                  ></div>
                {:else if progress}
                  <div
                    class="progress-line w-full position-absolute bottom-0 left-0"
                  >
                    <div class="progress-fill" style="width: {progress}%"></div>
                  </div>
                {/if}

                <!-- Border Effect for Target/Current -->
                {#if target}
                  <div class="target-border position-absolute inset-0"></div>
                {/if}
              </div>
            </div>
          {/if}
        {/await}
      {/each}
    {/if}
  {/await}
</div>

<style>
  /* ==========================================================================
     GRID LAYOUT
     ========================================================================== */

  .episode-grid {
    display: grid;
    /* Responsive Grid: Cards larger (min 34rem) */
    grid-template-columns: repeat(auto-fill, minmax(34rem, 1fr));
    gap: 2rem;
    padding: 2rem;
    align-content: start;
  }

  /* Reset margin on items since we use grid gap */
  .episode-card-wrapper {
    width: 100%;
    aspect-ratio: 16/9; /* Cinema Ratio */
  }

  /* ==========================================================================
     CINEMA CARD STYLING
     ========================================================================== */

  .cinema-card {
    background: var(--dark-color-dim);
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    border: 0.1rem solid transparent;
    overflow: hidden;
    transform-origin: center center;
  }

  .cinema-card.completed {
    filter: grayscale(0.6);
    opacity: 0.8;
  }
  .cinema-card.completed:hover {
    filter: grayscale(0);
    opacity: 1;
  }

  /* Hover Effects */
  @media (hover: hover) and (pointer: fine) {
    .cinema-card:hover {
      transform: scale(1.02);
      z-index: 10;
      box-shadow: 0 1.5rem 4rem hsla(var(--black-color-hsl), 0.6);
      border-color: hsla(var(--white-color-hsl), 0.15);
    }

    .cinema-card:hover .cinema-image {
      transform: scale(1.05);
    }

    .cinema-card:hover .play-icon-wrapper {
      opacity: 1;
      transform: scale(1);
    }

    .cinema-card:hover .cinema-overlay {
      opacity: 0.9; /* Slightly lighten overlay on hover if needed, or keep consistent */
    }
  }

  /* Image Transition */
  :global(.cinema-image) {
    transition: transform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
    object-fit: cover;
  }

  /* Overlay Gradients */
  .cinema-overlay {
    background: linear-gradient(
      to bottom,
      hsla(var(--black-color-hsl), 0.3) 0%,
      transparent 25%,
      transparent 50%,
      hsla(var(--black-color-hsl), 0.8) 80%,
      hsla(var(--black-color-hsl), 0.95) 100%
    );
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .unreleased-overlay {
    background: repeating-linear-gradient(
      -45deg,
      hsla(var(--black-color-hsl), 0.5),
      hsla(var(--black-color-hsl), 0.5) 1rem,
      transparent 1rem,
      transparent 2rem
    );
  }

  /* Play Icon (Glassmorphic) */
  .play-icon-wrapper {
    width: 5rem;
    height: 5rem;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    opacity: 0;
    transform: scale(0.8);
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    margin-top: 1.5rem;
    margin-right: 1.5rem;
    color: white;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  }

  .play-icon-wrapper:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: scale(1.1);
  }

  /* Make svg icon larger */
  .play-icon-wrapper svg {
    width: 2.4rem;
    height: 2.4rem;
    fill: white;
  }

  /* Content Overlay */
  .cinema-content {
    z-index: 2;
  }

  .text-shadow {
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
  }

  /* Badges */
  .badge {
    padding: 0.4rem 1rem;
    border-radius: 0.6rem;
    font-size: 1.2rem;
    line-height: normal;
    backdrop-filter: blur(4px);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  }
  .badge-warning {
    background-color: hsla(var(--senary-color-hsl), 0.9);
    color: black;
  }
  .badge-danger {
    background-color: hsla(var(--error-color-hsl), 0.9);
    color: white !important;
  }
  .badge-success {
    background-color: hsla(var(--completed-color-hsl), 0.9);
    color: white !important;
  }

  .gap-5 {
    gap: 0.5rem;
  }

  /* Progress Bar */
  .progress-line {
    height: 0.3rem;
    background: rgba(255, 255, 255, 0.15);
  }
  .progress-line.completed {
    background: var(--septenary-color); /* Purple for completed */
    box-shadow: 0 0 10px var(--septenary-color);
  }
  .progress-fill {
    height: 100%;
    background: var(--tertiary-color); /* Blue for in-progress */
    box-shadow: 0 0 10px var(--tertiary-color);
  }
  .target-border {
    border: 0.2rem solid var(--tertiary-color);
    border-radius: 0.2rem; /* Matches card inner */
    pointer-events: none;
    box-shadow: inset 0 0 20px rgba(var(--tertiary-color-rgb), 0.3);
  }

  /* Torrent Button Styles */
  .torrent-btn-wrapper {
    transition: transform 0.2s ease;
    margin-right: 1rem;
    margin-top: 1rem;
  }
  .torrent-btn-wrapper:hover {
    transform: scale(1.1);
  }

  .img-cover {
    object-fit: cover;
  }

  /* Utilities */
  .inset-0 {
    inset: 0;
  }
  .z-2 {
    z-index: 2;
  }
</style>
