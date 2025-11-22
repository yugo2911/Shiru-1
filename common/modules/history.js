import { updateState } from '@/views/Updater/UpdateModal.svelte'
import { notifyView } from '@/components/Notifications.svelte'
import { rss } from '@/views/TorrentSearch/TorrentModal.svelte'
import { files } from '@/views/Player/MediaHandler.svelte'
import { SUPPORTS } from '@/modules/support.js'
import { writable } from 'simple-store-svelte'
import { page, view } from '@/App.svelte'
import Debug from 'debug'
const debug = Debug('ui:history')

/**
 * Manages navigation history for back/forward movement.
 * TODO: Change the settings tabs have page routes to support history navigation.
 * TODO: Support fileDetails and fileEditor overlays.. Possibly consider supporting the trailer overlay.
 */
class HistoryManager {
  /** @type {{view: {type: string, value: any, timestamp: number} | null, rss: {type: string, value: any, timestamp: number} | null}} */
  pendingClosures = { view: null, rss: null }
  /** @type {Array<{type:string,value:any,timestamp:number,parentPage?:string,parentView?:string,isTemp?:boolean}>} */
  history = []
  /** @type {number} */
  currentIndex = -1
  /** @type {boolean} */
  ignoreNext = false
  /** @type {boolean} */
  initialized = false
  /** @type {Array<() => void>} */
  unsubscribers = []
  /** @type {boolean} */
  isNavigating = false
  /** @type {boolean} */
  navigationLocked = false
  /** @type {Writable<boolean>} */
  canGoBack = writable(false)
  /** @type {Writable<boolean>} */
  canGoForward = writable(false)

  constructor() {
    if (SUPPORTS.isAndroid) {
      let minimizeApp = null
      window.Capacitor.Plugins.App.addListener('backButton', () => {
        debug('Android back button pressed', JSON.stringify({ canGoBack: canGoBack.value, minimizeApp: minimizeApp, currentIndex: this.currentIndex, historyLength: this.history.length }))
        if (canGoBack.value) this.goBack()
        else if (minimizeApp) {
          debug('Second back press detected, minimizing app')
          clearTimeout(minimizeApp)
          minimizeApp = null
          window.Capacitor.Plugins.App.minimizeApp()
        } else {
          debug('First back press, setting minimize timeout')
          minimizeApp = setTimeout(() => {
            debug('Resetting minimize timeout it has been 1000ms')
            minimizeApp = null
          }, 1_000)
          minimizeApp?.unref?.()
        }
      })
    }
    window.addEventListener('mouseup', (event) => {
      if (event.button === 3) {
        debug('Mouse back button pressed')
        event.preventDefault()
        this.goBack()
      } else if (event.button === 4) {
        debug('Mouse forward button pressed')
        event.preventDefault()
        this.goForward()
      }
    })
  }

  /**
   * Initializes the HistoryManager, subscribing to stores and adding the initial page entry.
   */
  initialize() {
    if (this.initialized) return
    this.initialized = true
    debug('Initializing HistoryManager')
    const storeMap = { page, view, updateState, notifyView, rss }
    for (const [type, store] of Object.entries(storeMap)) {
      this.unsubscribers.push(
        store.subscribe(value => {
          debug('Store change detected', type, JSON.stringify(value))
          this.handleChange(type, value)
        })
      )
    }
    this.addHistoryEntry('page', 'home')
    this.syncState()
  }

  /**
   * Moves back one step in history if possible.
   * @param {boolean} skipLock Ignores navigation lock and skips locking navigation.
   */
  goBack(skipLock = false) {
    debug('goBack called', JSON.stringify({ currentIndex: this.currentIndex }))
    if (!skipLock) {
      if (this.navigationLocked) {
        debug('goBack ignored, navigation cooldown active')
        return
      }
      this.lockNavigation()
    }
    const current = this.history[this.currentIndex]
    let skipNavigation = false
    if (current) {
      const overlayStores = { updateState, notifyView, rss, view }
      if (overlayStores[current.type]) {
        const store = overlayStores[current.type]
        const differs = current.type === 'rss' || current.type === 'view' ? JSON.stringify(store.value) !== JSON.stringify(current.value) : store.value !== current.value
        if (differs && this.currentIndex === this.history.length - 1 && !current.isTemp) {
          const tempState = { type: current.type, value: store.value, timestamp: Date.now(), isTemp: true }
          this.history.splice(this.currentIndex + 1, 0, tempState)
          debug('Temp entry added for forward navigation', JSON.stringify(tempState))
          this.setIgnoreNext(() => store.set(current.value))
          skipNavigation = true
          debug('Overlay restored without moving history', current.type, current.value)
        }
      }
    }
    if (this.currentIndex > 0 && !skipNavigation) {
      this.navigateTo(this.currentIndex - 1, true)
      this.syncState()
      debug('goBack finished', JSON.stringify({ currentIndex: this.currentIndex, historyLength: this.history.length }))
    }
  }

  /**
   * Moves forward one step in history if possible.
   * @param {boolean} skipLock Ignores navigation lock and skips locking navigation.
   */
  goForward(skipLock = false) {
    debug('goForward called', JSON.stringify({ currentIndex: this.currentIndex }))
    if (!skipLock) {
      if (this.navigationLocked) {
        debug('goForward ignored, navigation cooldown active')
        return
      }
      this.lockNavigation()
    }
    if (this.currentIndex < this.history.length - 1) {
      let next = this.history[this.currentIndex + 1]
      if (next?.isTemp) {
        debug('Navigating to temp forward entry', JSON.stringify(next))
        const overlayStores = { updateState, notifyView, rss, view }
        const store = overlayStores[next.type]
        if (JSON.stringify(store.value) !== JSON.stringify(next.value)) this.navigateTo(this.currentIndex + 1)
        else this.currentIndex++
        return
      }
      if (next) {
        debug('Navigating forward to next history entry', JSON.stringify(next))
        this.navigateTo(this.currentIndex + 1)
      }
    }
  }

  /**
   * Navigates to a specific history index and restores state.
   * @param {number} index Index to navigate to
   * @param {boolean} [back=false] If navigating backward
   */
  navigateTo(index, back = false) {
    debug('navigateTo called', JSON.stringify({ index, back }))
    if (index < 0 || index >= this.history.length) return
    this.isNavigating = true
    this.currentIndex = index
    const state = this.history[index]
    if (document.fullscreenElement) document.exitFullscreen()
    this.ignoreNext = true
    try {
      switch (state.type) {
        case 'page':
          this.restorePage(state.value, back)
          break
        case 'view':
          this.restoreView(state.value)
          break
        case 'updateState':
        case 'notifyView':
        case 'rss':
          this.restoreOverlay(state.type, state.value)
          break
      }
    } finally {
      this.ignoreNext = false
    }
    this.isNavigating = false
    this.syncState()
    debug('Navigated to index', index, 'state', JSON.stringify(state))
  }

  /**
   * Adds a new history entry for the given type and value.
   * @param {string} type The type of history entry (e.g., 'page', 'view', 'updateState', 'notifyView', 'rss')
   * @param {any} value The value to store for this entry (e.g., page name, view state, overlay state)
   */
  addHistoryEntry(type, value) {
    if (this.ignoreNext || this.isNavigating) {
      debug(`Skipping addHistoryEntry due to ${this.ignoreNext ? 'ignoreNext' : 'isNavigating'}`, type, JSON.stringify(value))
      this.ignoreNext = false
      return
    }
    const previousEntry = this.history[this.currentIndex]
    if (previousEntry && previousEntry.type === type && JSON.stringify(previousEntry.value) === JSON.stringify(value)) {
      debug('Duplicate consecutive entry ignored', type, value)
      return
    }
    const state = { type, value, timestamp: Date.now() }
    if (['updateState', 'notifyView', 'rss'].includes(type)) {
      state.parentPage = page.value
      state.parentView = view.value
    } else if (type === 'view') state.parentPage = page.value
    this.history = this.history.slice(0, this.currentIndex + 1)
    this.history.push(state)
    this.currentIndex = this.history.length - 1
    debug('History added', JSON.stringify(state), 'currentIndex', this.currentIndex, 'historyLength', this.history.length)
    this.syncState()
  }

  /**
   * Handles store changes and determines whether to add them to history.
   * @param {string} type Store type
   * @param {any} value New store value
   */
  handleChange(type, value) {
    if ((type === 'view' || type === 'rss') && value == null) {
      const currentEntry = this.history[this.currentIndex]
      if (currentEntry?.type === type && currentEntry.value != null) {
        if (this.isNavigating) { debug(`${type === 'view' ? 'View' : 'RSS'} closed during navigation, skipping`); return }
        this.pendingClosures[type] = { type, value, timestamp: Date.now() }
        setTimeout(() => {
          const pendingType = this.pendingClosures[type]
          if (pendingType) {
            const lastEntry = this.history[this.currentIndex]
            if (lastEntry?.type === 'page' && (Date.now() - pendingType.timestamp) <= 10) debug(`${type === 'view' ? 'View' : 'RSS'} closed due to page navigation, skipping closure log`)
            else {
              debug(`${type === 'view' ? 'View' : 'RSS'} closed independently, adding closure to history`)
              this.addHistoryEntry(pendingType.type, pendingType.value)
            }
            this.pendingClosures[type] = null
          }
        }).unref?.()
      }
    } else if (value != null && ((type === 'updateState' && value === 'ready') || (type === 'notifyView' && value === true) || !['updateState', 'notifyView'].includes(type))) {
      if (type === 'view' || type === 'rss') {
        const altType = type === 'view' ? 'rss' : 'view'
        const pendingType = this.pendingClosures[altType]
        if (pendingType) {
          debug(`${altType === 'view' ? 'View' : 'RSS'} closed to open ${type}, adding closure to history`)
          this.addHistoryEntry(pendingType.type, pendingType.value)
          this.pendingClosures[altType] = null
        }
      }
      debug('Valid change detected, adding history entry', type, JSON.stringify(value))
      if (type === 'page') { this.pendingClosures.view = null; this.pendingClosures.rss = null }
      this.addHistoryEntry(type, value)
    }
  }

  /**
   * Restores parent page/view for overlays.
   * @param {{parentPage?: string, parentView?: string}} state Object containing optional parentPage and parentView to restore
   */
  restoreParents(state) {
    if (state.parentPage && page.value !== state.parentPage && !(state.parentPage === 'player' && (!files?.value || files?.value?.length === 0))) {
      this.setIgnoreNext(() => page.set(state.parentPage))
      debug('Restoring parent page', state.parentPage)
    }
    if (state.parentView && view.value !== state.parentView) {
      this.setIgnoreNext(() => view.set(state.parentView))
      debug('Restoring parent view', state.parentView)
    }
  }

  /**
   * Resets overlays optionally for update, notify, rss, and view.
   * @param {{update?: boolean, notify?: boolean, rssReset?: boolean, clearView?: boolean}} options Specifies which overlays to reset; any property set to `true` will reset that overlay.
   */
  resetOverlays({ update = true, notify = true, rssReset = true, clearView = false } = {}) {
    if (update) this.setIgnoreNext(() => updateState.set('up-to-date'))
    if (notify) this.setIgnoreNext(() => notifyView.set(false))
    if (rssReset) this.setIgnoreNext(() => rss.set(null))
    if (clearView) this.setIgnoreNext(() => view.set(null))
    this.setIgnoreNext(() => window.dispatchEvent(new Event('overlay-check')))
    debug('Overlays reset', JSON.stringify({ update, notify, rssReset, clearView }))
  }

  /**
   * Restores a page state.
   * @param {string} value The page name to restore
   * @param {boolean} [back=false] Whether this restore is triggered by backward navigation
   */
  restorePage(value, back = false) {
    debug('restorePage called', value, back)
    if (value === 'player' && (!files?.value || files?.value?.length === 0)) back ? this.goBack(true) : this.goForward(true)
    else {
      this.resetOverlays({ clearView: true })
      this.setIgnoreNext(() => page.set(value))
    }
  }

  /**
   * Restores a view state.
   * @param {any} value The view state to restore
   */
  restoreView(value) {
    debug('restoreView called', JSON.stringify(value))
    const state = this.history[this.currentIndex]
    this.resetOverlays()
    this.restoreParents(state)
    this.setIgnoreNext(() => view.set(value))
  }

  /**
   * Restores an overlay (updateState, notifyView, rss) state.
   * @param {string} type The type of overlay to restore ('updateState', 'notifyView', 'rss')
   * @param {any} value The value/state to restore for the overlay
   */
  restoreOverlay(type, value) {
    debug('restoreOverlay called', type, JSON.stringify(value))
    const state = this.history[this.currentIndex]
    const overlayActions = {
      updateState: () => {
        this.resetOverlays({ notify: true, rssReset: true })
        this.restoreParents(state)
        this.setIgnoreNext(() => updateState.set(value))
      },
      notifyView: () => {
        this.resetOverlays({ update: true, rssReset: true })
        this.restoreParents(state)
        this.setIgnoreNext(() => notifyView.set(value))
      },
      rss: () => {
        this.resetOverlays({ update: true, notify: true })
        this.restoreParents(state)
        this.setIgnoreNext(() => rss.set(value))
      }
    }
    overlayActions[type]?.()
  }

  /**
   * Updates the writable states for canGoBack and canGoForward.
   */
  syncState() {
    this.canGoBack.set(this.currentIndex > 0)
    this.canGoForward.set(this.currentIndex < this.history.length - 1)
    debug('Navigation state updated', JSON.stringify({ canGoBack: this.currentIndex > 0, canGoForward: this.currentIndex < this.history.length - 1 }))
  }

  /**
   * Temporarily locks navigation actions (back/forward) to prevent rapid repeated input.
   * This helps avoid inconsistent state updates caused by users spamming navigation.
   */
  lockNavigation() {
    this.navigationLocked = true
    setTimeout(() => this.navigationLocked = false, 150).unref?.()
  }

  /**
   * Executes a callback while ignoring the next history addition.
   * @param {() => void} cb The callback function to execute
   */
  setIgnoreNext(cb) {
    this.ignoreNext = true
    cb()
  }

  /**
   * Clears all overlays and resets the view.
   */
  clearState() {
    debug('clearState called')
    this.resetOverlays({ clearView: true })
  }

  /**
   * Returns debug information about current history and navigation state.
   */
  getDebugInfo() {
    return {
      currentIndex: this.currentIndex,
      historyLength: this.history.length,
      canGoBack: this.currentIndex > 0,
      canGoForward: this.currentIndex < this.history.length - 1,
      history: this.history
    }
  }

  /**
   * Destroys the history manager, unsubscribing from all stores.
   */
  destroy() {
    this.unsubscribers.forEach(unsubscribe => unsubscribe())
    this.unsubscribers = []
    this.initialized = false
    debug('HistoryManager destroyed')
  }
}

/** @type {HistoryManager} */
const historyManager = new HistoryManager()
/** @type {Writable<boolean>} */
export const canGoBack = historyManager.canGoBack
/** @type {Writable<boolean>} */
export const canGoForward = historyManager.canGoForward
/** @type {() => void} Initializes history management and sets up store subscriptions. */
export const enableHistory = () => historyManager.initialize()
/** @type {() => void} Cleans up history manager and unsubscribes from all stores. */
export const destroyHistory = () => historyManager.destroy()
/** @type {() => void} Navigates back one step in history. */
export const goBack = () => historyManager.goBack()
/** @type {() => void} Navigates forward one step in history. */
export const goForward = () => historyManager.goForward()