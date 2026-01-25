const translationsCache = {};
let currentTranslations = {};
let selectedItems = []; // Array of {gridButton, rocketIndex, key}
let currentLanguage = localStorage.getItem('selectedLanguage') || "en";
const DEBUG_MODE = false;
const RETURN_ANIMATION_MS = 1400;
const AUTO_RETURN_DELAY_MS = 20000;
const AUTO_RETURN_ENABLED = true;
let wordcloudReturnTimer = null;
let isWordcloudVisible = false;


const langDirections = {
  en: "ltr",
  he: "rtl",
  ar: "rtl",
};

async function loadTranslations(lang) {
  if (translationsCache[lang]) {
    return translationsCache[lang];
  }

  const response = await fetch(`/translations/${lang}.json`);
  if (!response.ok) {
    throw new Error(`Failed to load translations for ${lang}`);
  }

  const data = await response.json();
  translationsCache[lang] = data;
  return data;
}


function formatTextForBox(element, text) {
  // Remove any existing text-content wrapper
  const existingContent = element.querySelector('.text-content');
  if (existingContent) {
    existingContent.remove();
  }
  
  // Get text direction from document (set by setLanguageAttributes)
  // This ensures RTL languages (Hebrew, Arabic) render correctly
  const direction = document.documentElement.getAttribute('dir') || 'ltr';
  
  // Create text-content wrapper
  const textContent = document.createElement('div');
  textContent.className = 'text-content';
  textContent.style.direction = direction; // Set direction for RTL support
  textContent.style.textAlign = 'center'; // Center alignment for both directions
  textContent.textContent = text.trim();
  
  // Add to element
  element.appendChild(textContent);
}

function applyTranslations(translations) {
  currentTranslations = translations;
  
  // Apply translations to all elements with data-key (excluding rocket blocks and description elements)
  document.querySelectorAll("[data-key]").forEach((el) => {
    // Skip rocket blocks - they're handled separately
    if (el.classList.contains("rocket-button")) {
      return;
    }
    // Skip description elements - they have their own styling
    if (el.classList.contains("description-title") || el.classList.contains("description-subtitle")) {
      const key = el.dataset.key;
      el.textContent = translations[key] || "";
      return;
    }
    const key = el.dataset.key;
    const text = translations[key] || "";
    if (text) {
      formatTextForBox(el, text);
    }
  });
  
  // Update rocket blocks with current translations
  updateRocketBlocks();
}

function updateLanguageButtonStates() {
  const langButtons = document.querySelectorAll(".lang-button");
  langButtons.forEach((button) => {
    if (button.dataset.lang === currentLanguage) {
      button.classList.add("selected");
    } else {
      button.classList.remove("selected");
    }
  });
}

function updateRocketBlocks() {
  const rocketBlocks = document.querySelectorAll(".rocket-choices .rocket-button");
  
  // Clear all rocket blocks first
  rocketBlocks.forEach((block) => {
    const existingContent = block.querySelector('.text-content');
    if (existingContent) {
      existingContent.remove();
    }
  });
  
  // Populate rocket blocks with selected items
  selectedItems.forEach((item) => {
    const rocketBlock = rocketBlocks[item.rocketIndex];
    if (rocketBlock && currentTranslations[item.key]) {
      formatTextForBox(rocketBlock, currentTranslations[item.key]);
    }
  });
}

function updateGridStates() {
  const gridButtons = document.querySelectorAll(".purple-block");
  const maxSelections = 3;
  const isMaxSelected = selectedItems.length >= maxSelections;
  
  gridButtons.forEach((button) => {
    const key = button.dataset.key;
    const isSelected = selectedItems.some((item) => item.key === key);
    
    // Toggle selected class
    if (isSelected) {
      button.classList.add("selected");
      button.classList.remove("disabled");
    } else {
      button.classList.remove("selected");
      // Disable if max selections reached and this item is not selected
      if (isMaxSelected) {
        button.classList.add("disabled");
      } else {
        button.classList.remove("disabled");
      }
    }
  });
  
  // Update launch button state
  updateLaunchButtonState();
}

function updateLaunchButtonState() {
  const launchButton = document.querySelector(".launch-button");
  if (!launchButton) return;
  
  const hasThreeSelections = selectedItems.length === 3;
  
  if (hasThreeSelections) {
    launchButton.disabled = false;
    launchButton.classList.remove("disabled");
  } else {
    launchButton.disabled = true;
    launchButton.classList.add("disabled");
  }
}

function handleGridItemClick(gridButton) {
  const key = gridButton.dataset.key;
  const existingIndex = selectedItems.findIndex((item) => item.key === key);
  
  if (existingIndex !== -1) {
    // Deselect: remove from selectedItems
    selectedItems.splice(existingIndex, 1);
  } else {
    // Select: only if we have less than 3 selections
    if (selectedItems.length < 3) {
      // Find next available rocket block index
      const usedIndices = selectedItems.map((item) => item.rocketIndex);
      let rocketIndex = 0;
      while (usedIndices.includes(rocketIndex) && rocketIndex < 3) {
        rocketIndex++;
      }
      
      if (rocketIndex < 3) {
        selectedItems.push({
          gridButton: gridButton,
          rocketIndex: rocketIndex,
          key: key,
        });
      }
    }
  }
  
  updateRocketBlocks();
  updateGridStates();
}

function handleRocketBlockClick(rocketBlock) {
  const rocketIndex = parseInt(rocketBlock.dataset.index);
  const existingIndex = selectedItems.findIndex(
    (item) => item.rocketIndex === rocketIndex
  );
  
  if (existingIndex !== -1) {
    // Deselect: remove from selectedItems
    selectedItems.splice(existingIndex, 1);
    updateRocketBlocks();
    updateGridStates();
  }
}

function setLanguageAttributes(lang) {
  const direction = langDirections[lang] || "ltr";
  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("dir", direction);
  
  // Remove all language classes
  document.documentElement.classList.remove("lang-he", "lang-en", "lang-ar");
  // Add current language class
  document.documentElement.classList.add(`lang-${lang}`);
}

async function setLanguage(lang, shouldRegenerate = true) {
  try {
    currentLanguage = lang;
    // Save language selection to localStorage
    localStorage.setItem('selectedLanguage', lang);
    
    const translations = await loadTranslations(lang);
    setLanguageAttributes(lang);
    applyTranslations(translations);
    updateLanguageButtonStates();
    
    // If on wordcloud page, just switch to the correct language image (no regeneration needed)
    if (isWordcloudPage()) {
      updateWordcloudImage(lang);
    }
    // Note: No need to regenerate wordcloud when changing language since preview_wordcloud
    // already generates wordclouds for all languages
  } catch (error) {
    console.error(error);
  }
}

function isWordcloudPage() {
  return window.location.pathname === '/wordcloud';
}

function clearReturnTimer() {
  if (wordcloudReturnTimer) {
    clearTimeout(wordcloudReturnTimer);
    wordcloudReturnTimer = null;
  }
}

const WORDCLOUD_FADE_MS = 500;

function returnToSelection() {
  if (!isWordcloudVisible) {
    return;
  }
  clearReturnTimer();
  isWordcloudVisible = false;

  const selectionContainer = document.querySelector(".selection-container");
  const wordcloudContainer = document.querySelector(".wordcloud-container");
  const wordcloudImage = document.getElementById('wordcloud-image');
  const rocket = document.querySelector(".rocket");
  const halo = document.querySelector(".halo");
  const stars = selectionContainer
    ? selectionContainer.querySelectorAll(".star")
    : document.querySelectorAll(".star");
  const description = document.querySelector(".description");
  const buttonContainer = document.querySelector(".button-container");
  const languageChoice = selectionContainer
    ? selectionContainer.querySelector(".language-choice")
    : document.querySelector(".language-choice");
  
  // Step 1: Fade out the wordcloud image
  if (wordcloudImage) {
    wordcloudImage.classList.add("fading-out");
  }
  
  // Step 2: After wordcloud fades out, show selection and start animations
  setTimeout(() => {
    // Hide wordcloud container
    if (wordcloudContainer) {
      wordcloudContainer.classList.add("is-hidden");
    }
    if (wordcloudImage) {
      wordcloudImage.classList.remove("fading-out");
    }
    
    // Ensure description, buttons, and language choice start at opacity 0 before showing container
    if (description) {
      description.classList.add("launching");
    }
    if (buttonContainer) {
      buttonContainer.classList.add("launching");
    }
    if (languageChoice) {
      languageChoice.classList.add("launching");
    }
    
    // Show selection container
    if (selectionContainer) {
      selectionContainer.classList.remove("is-hidden");
    }

    // Start rocket/halo/stars return animation
    if (rocket) {
      rocket.classList.remove("launching");
      rocket.classList.add("returning");
    }
    if (halo) {
      halo.classList.remove("launching");
      halo.classList.add("returning");
    }
    if (stars.length) {
      stars.forEach((star) => {
        star.classList.remove("launching");
        star.classList.add("returning");
      });
    }

    // Fade in description, buttons, and language choice after a short delay to ensure transition triggers
    setTimeout(() => {
      if (description) {
        description.classList.remove("launching");
      }
      if (buttonContainer) {
        buttonContainer.classList.remove("launching");
      }
      if (languageChoice) {
        languageChoice.classList.remove("launching");
      }
    }, 50);

    // Reset selections and re-enable interaction
    selectedItems = [];
    updateRocketBlocks();
    updateGridStates();
    updateLaunchButtonState();
    setLaunchInteractionDisabled(false);

    // Clean up returning class after animation completes
    setTimeout(() => {
      if (rocket) {
        rocket.classList.remove("returning");
      }
      if (halo) {
        halo.classList.remove("returning");
      }
      if (stars.length) {
        stars.forEach((star) => star.classList.remove("returning"));
      }
    }, RETURN_ANIMATION_MS);
  }, WORDCLOUD_FADE_MS);
}

async function showWordcloudView() {
  const selectionContainer = document.querySelector(".selection-container");
  const wordcloudContainer = document.querySelector(".wordcloud-container");
  const wordcloudImage = document.getElementById('wordcloud-image');
  
  // Keep wordcloud container hidden and set up image for fade-in
  if (wordcloudContainer) {
    wordcloudContainer.classList.add("is-hidden");
  }
  if (wordcloudImage) {
    wordcloudImage.classList.remove("fading-out");
    wordcloudImage.classList.add("fading-in");
  }
  
  // Load the image while selection container is still visible (but faded out)
  await loadWordcloudImage(currentLanguage);
  
  // Now swap: hide selection, show wordcloud
  if (selectionContainer) {
    selectionContainer.classList.add("is-hidden");
  }
  if (wordcloudContainer) {
    wordcloudContainer.classList.remove("is-hidden");
  }
  
  // Fade in the wordcloud image after a short delay
  setTimeout(() => {
    if (wordcloudImage) {
      wordcloudImage.classList.remove("fading-in");
    }
  }, 50);
  
  isWordcloudVisible = true;
  clearReturnTimer();
  if (AUTO_RETURN_ENABLED) {
    wordcloudReturnTimer = setTimeout(returnToSelection, AUTO_RETURN_DELAY_MS);
  }
}

async function precomputeWordcloud(selectedKeys) {
  const response = await fetch('/preview-wordcloud', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      items: selectedKeys,
      language: currentLanguage 
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to precompute wordcloud');
  }
}

function getWordcloudImagePath(language) {
  // Returns the path to the final wordcloud image
  // User only sees the final wordcloud, never the preview
  return `/static/wordcloud/wordcloud_${language}.png`;
}

function commitWordcloud() {
  // Copy preview wordclouds to final location
  return fetch('/commit-wordcloud', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  }).then(response => {
    if (response.ok) {
      return response.json();
    }
    throw new Error('Failed to commit wordcloud');
  }).catch(error => {
    console.error('Error committing wordcloud:', error);
    // Return resolved promise so calling code doesn't wait forever
    return Promise.resolve();
  });
}

function loadWordcloudImage(language) {
  const wordcloudImage = document.getElementById('wordcloud-image');
  if (!wordcloudImage) {
    console.error('Wordcloud image element not found');
    return Promise.resolve();
  }

  const path = getWordcloudImagePath(language);
  const newSrc = path + '?t=' + Date.now();

  return new Promise((resolve, reject) => {
    const handleLoad = () => {
      resolve();
    };
    const handleError = () => {
      reject(new Error('Failed to load wordcloud image'));
    };

    wordcloudImage.addEventListener('load', handleLoad, { once: true });
    wordcloudImage.addEventListener('error', handleError, { once: true });
    wordcloudImage.src = newSrc;
  });
}

function updateWordcloudImage(language) {
  // Update wordcloud image src to the correct language version
  // Always show the final wordcloud (user never sees preview)
  loadWordcloudImage(language).catch((error) => {
    console.error('Error updating wordcloud image:', error);
  });
}

async function regenerateWordcloud(language) {
  try {
    const response = await fetch('/regenerate-wordcloud', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ language: language })
    });
    
    if (!response.ok) {
      throw new Error('Failed to regenerate wordcloud');
    }
    
    // All languages are regenerated, just update the image to the requested language
    updateWordcloudImage(language);
    
    return getWordcloudImagePath(language);
  } catch (error) {
    console.error('Error regenerating wordcloud:', error);
    throw error;
  }
}

function setLaunchInteractionDisabled(isDisabled) {
  const selectors = [".purple-block", ".rocket-button", ".launch-button"];
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((button) => {
      button.disabled = isDisabled;
      if (isDisabled) {
        button.classList.add("disabled");
      } else {
        button.classList.remove("disabled");
      }
    });
  });
}

function playRocketLaunchAnimation() {
  return new Promise((resolve) => {
    const selectionContainer = document.querySelector(".selection-container");
    const rocket = document.querySelector(".rocket");
    if (!rocket) {
      resolve();
      return;
    }
    const halo = document.querySelector(".halo");
    const stars = selectionContainer
      ? selectionContainer.querySelectorAll(".star")
      : document.querySelectorAll(".star");
    const description = document.querySelector(".description");
    const buttonContainer = document.querySelector(".button-container");
    const languageChoice = selectionContainer
      ? selectionContainer.querySelector(".language-choice")
      : document.querySelector(".language-choice");

    const onEnd = () => {
      rocket.removeEventListener("animationend", onEnd);
      resolve();
    };

    rocket.addEventListener("animationend", onEnd, { once: true });
    rocket.classList.add("launching");
    if (halo) {
      halo.classList.add("launching");
    }
    if (stars.length) {
      stars.forEach((star) => star.classList.add("launching"));
    }
    if (description) {
      description.classList.add("launching");
    }
    if (buttonContainer) {
      buttonContainer.classList.add("launching");
    }
    if (languageChoice) {
      languageChoice.classList.add("launching");
    }

    // Fallback in case animationend doesn't fire
    setTimeout(() => {
      if (rocket.classList.contains("launching")) {
        resolve();
      }
    }, 1700);
  });
}

async function handleLaunchButtonClick() {
  if (selectedItems.length !== 3) {
    return; // Should not happen if button is properly disabled
  }
  
  const launchButton = document.querySelector(".launch-button");
  if (launchButton) {
    launchButton.disabled = true;
    launchButton.classList.add("disabled");
    const originalText = launchButton.textContent;
    // Optionally show loading state
    // launchButton.textContent = "Loading...";
  }

  setLaunchInteractionDisabled(true);
  
  // Collect selected item keys
  const selectedKeys = selectedItems.map(item => item.key);
  
  // Generate preview wordcloud in background
  const precomputePromise = precomputeWordcloud(selectedKeys);

  await playRocketLaunchAnimation();
  
  try {
    // Submit vote and redirect immediately
    const response = await fetch('/submit-vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: selectedKeys })
    });
    
    if (!response.ok) {
      throw new Error('Failed to submit vote');
    }
    
    // Wait for wordcloud generation before showing it
    await precomputePromise;
    // Stay on the same page and show wordcloud in-place
    await commitWordcloud();
    await showWordcloudView();
  } catch (error) {
    console.error('Error submitting vote:', error);
    alert('Failed to submit vote. Please try again.');
    
    // Restore button state on error
    if (launchButton) {
      launchButton.disabled = false;
      launchButton.classList.remove("disabled");
    }
    const rocket = document.querySelector(".rocket");
    if (rocket) {
      rocket.classList.remove("launching");
    }
    const halo = document.querySelector(".halo");
    if (halo) {
      halo.classList.remove("launching");
    }
    const selectionContainer = document.querySelector(".selection-container");
    const stars = selectionContainer
      ? selectionContainer.querySelectorAll(".star")
      : document.querySelectorAll(".star");
    if (stars.length) {
      stars.forEach((star) => star.classList.remove("launching"));
    }
    const description = document.querySelector(".description");
    if (description) {
      description.classList.remove("launching");
    }
    const buttonContainer = document.querySelector(".button-container");
    if (buttonContainer) {
      buttonContainer.classList.remove("launching");
    }
    const languageChoice = document.querySelector(".language-choice");
    if (languageChoice) {
      languageChoice.classList.remove("launching");
    }
    setLaunchInteractionDisabled(false);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const langButtons = document.querySelectorAll(".lang-button");

  langButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const lang = button.dataset.lang;
      if (lang) {
        setLanguage(lang);
      }
    });
  });

  // Set up grid item click handlers
  const gridButtons = document.querySelectorAll(".purple-block");
  gridButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleGridItemClick(button);
    });
  });

  // Set up rocket block click handlers
  const rocketBlocks = document.querySelectorAll(".rocket-choices .rocket-button");
  rocketBlocks.forEach((block) => {
    block.addEventListener("click", () => {
      handleRocketBlockClick(block);
    });
  });

  // Set up launch button click handler (if on index page)
  const launchButton = document.querySelector(".launch-button");
  if (launchButton) {
    launchButton.addEventListener("click", () => {
      if (!launchButton.disabled) {
        handleLaunchButtonClick();
      }
    });
  }

  // Set up back button click handler (if on wordcloud page)
  const backButton = document.querySelector(".back-button");
  if (backButton) {
    backButton.addEventListener("click", () => {
      if (isWordcloudPage()) {
        window.location.href = '/';
        return;
      }
      returnToSelection();
    });
  }

  // Initialize language from localStorage (or default to "en") without regenerating wordcloud on page load
  setLanguage(currentLanguage, false);
  
  // If on wordcloud page, initialize the image with the current language
  if (isWordcloudPage()) {
    updateWordcloudImage(currentLanguage);
  }
  
  // If on index page, commit any pending preview wordclouds
  if (!isWordcloudPage()) {
    commitWordcloud();
  }
  
  // Initialize launch button state (should be disabled initially, only on index page)
  if (!isWordcloudPage()) {
    updateLaunchButtonState();
  }
});