const translationsCache = {};
let currentTranslations = {};
let selectedItems = []; // Array of {gridButton, rocketIndex, key}
let currentLanguage = localStorage.getItem('selectedLanguage') || "en";


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
  return window.location.pathname === '/wordcloud' || 
         document.querySelector('.wordcloud-container') !== null;
}

async function precomputeWordcloud(selectedKeys) {
  try {
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
  } catch (error) {
    console.error('Error precomputing wordcloud:', error);
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

function updateWordcloudImage(language) {
  // Update wordcloud image src to the correct language version
  // Always show the final wordcloud (user never sees preview)
  const wordcloudImage = document.getElementById('wordcloud-image');
  if (wordcloudImage) {
    const path = getWordcloudImagePath(language);
    // Add cache busting to ensure fresh image
    const newSrc = path + '?t=' + Date.now();
    console.log('Updating wordcloud image to:', newSrc);
    wordcloudImage.src = newSrc;
  } else {
    console.error('Wordcloud image element not found');
  }
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
  const selectors = [".purple-block", ".rocket-button", ".lang-button", ".launch-button"];
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
    const rocket = document.querySelector(".rocket");
    if (!rocket) {
      resolve();
      return;
    }

    const onEnd = () => {
      rocket.removeEventListener("animationend", onEnd);
      resolve();
    };

    rocket.addEventListener("animationend", onEnd, { once: true });
    rocket.classList.add("launching");

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
  
  // Start preview wordcloud generation in background (don't wait for it)
  precomputeWordcloud(selectedKeys).catch(error => {
    console.error('Error generating preview wordcloud:', error);
  });

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
    
    // Redirect immediately - don't wait for wordcloud generation
    const data = await response.json();
    if (data.redirect) {
      window.location.href = data.redirect;
    }
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
      window.location.href = '/';
    });
  }

  // Initialize language from localStorage (or default to "en") without regenerating wordcloud on page load
  setLanguage(currentLanguage, false);
  
  // If on wordcloud page, initialize the image with the current language
  if (isWordcloudPage()) {
    updateWordcloudImage(currentLanguage);
    // Auto-redirect to home after 20 seconds
    setTimeout(() => {
      window.location.href = '/';
    }, 20000);
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