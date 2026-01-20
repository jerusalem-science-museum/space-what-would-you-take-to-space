const translationsCache = {};
let currentTranslations = {};
let selectedItems = []; // Array of {gridButton, rocketIndex, key}
let currentLanguage = localStorage.getItem('selectedLanguage') || "en";

// Cache font sizes by language and text (loaded from server)
let fontSizeCache = {}; // Key format: `${language}:${text}`

// Load font sizes from server
async function loadFontSizes() {
  try {
    const response = await fetch('/font-sizes');
    if (response.ok) {
      fontSizeCache = await response.json();
    }
  } catch (e) {
    console.warn('Failed to load font sizes:', e);
  }
}

// Debounce save function to avoid excessive writes
let saveTimeout;
function saveFontSizes() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await fetch('/font-sizes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fontSizes: fontSizeCache })
      });
    } catch (e) {
      console.warn('Failed to save font sizes:', e);
    }
  }, 500); // Wait 500ms after last change before saving
}

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


function splitTextIntoLines(text) {
  // Split text by spaces and put each word on a separate line
  const words = text.trim().split(/\s+/);
  
  // Return array with each word as a separate line
  return words.filter(word => word.length > 0);
}

function calculateOptimalFontSize(element, lines, text, language) {
  // Check cache first
  const cacheKey = `${language}:${text}`;
  if (fontSizeCache[cacheKey] !== undefined) {
    return fontSizeCache[cacheKey];
  }
  
  // Get the container dimensions (accounting for padding)
  const container = element;
  const computedStyle = window.getComputedStyle(container);
  const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
  const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
  const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
  
  const availableWidth = container.offsetWidth - paddingLeft - paddingRight;
  const availableHeight = container.offsetHeight - paddingTop - paddingBottom;
  
  if (availableWidth <= 0 || availableHeight <= 0) {
    const fallbackSize = 16;
    fontSizeCache[cacheKey] = fallbackSize;
    saveFontSizes(); // Save to server
    return fallbackSize;
  }
  
  // Find the longest line for width calculation
  const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b);
  
  // Get text direction (RTL or LTR) for proper measurement
  // Use document direction (set by language) rather than container direction
  const direction = document.documentElement.getAttribute('dir') || 'ltr';
  
  // Create a temporary span to measure text
  const tempSpan = document.createElement('span');
  tempSpan.style.visibility = 'hidden';
  tempSpan.style.position = 'absolute';
  tempSpan.style.whiteSpace = 'nowrap';
  tempSpan.style.fontFamily = computedStyle.fontFamily;
  tempSpan.style.fontWeight = computedStyle.fontWeight;
  tempSpan.style.direction = direction; // Important for RTL languages (Hebrew, Arabic)
  tempSpan.style.top = '-9999px';
  tempSpan.textContent = longestLine;
  document.body.appendChild(tempSpan);
  
  // Binary search for optimal font size
  let minSize = 8;
  let maxSize = 200;
  let optimalSize = minSize;
  const lineHeight = 1.1;
  const totalLines = lines.length;
  const margin = 0.85; // Use 85% of available space
  
  while (minSize <= maxSize) {
    const testSize = Math.floor((minSize + maxSize) / 2);
    tempSpan.style.fontSize = `${testSize}px`;
    
    const textWidth = tempSpan.offsetWidth;
    const singleLineHeight = tempSpan.offsetHeight;
    const totalTextHeight = singleLineHeight * totalLines * lineHeight;
    
    // Check if text fits within container
    const widthFits = textWidth <= (availableWidth * margin);
    const heightFits = totalTextHeight <= (availableHeight * margin);
    
    if (widthFits && heightFits) {
      optimalSize = testSize;
      minSize = testSize + 1;
    } else {
      maxSize = testSize - 1;
    }
  }
  
  document.body.removeChild(tempSpan);
  
  const finalSize = Math.max(optimalSize, 8); // Ensure minimum size
  // Cache the result and save to server
  fontSizeCache[cacheKey] = finalSize;
  saveFontSizes(); // Save to server
  return finalSize;
}

function formatTextForBox(element, text) {
  // Remove any existing text-content wrapper
  const existingContent = element.querySelector('.text-content');
  if (existingContent) {
    existingContent.remove();
  }
  
  // Split text into lines
  const lines = splitTextIntoLines(text);
  
  // Get text direction from document (set by setLanguageAttributes)
  // This ensures RTL languages (Hebrew, Arabic) render correctly
  const direction = document.documentElement.getAttribute('dir') || 'ltr';
  
  // Check if font size is cached
  const cacheKey = `${currentLanguage}:${text}`;
  const cachedFontSize = fontSizeCache[cacheKey];
  
  // Create text-content wrapper
  const textContent = document.createElement('div');
  textContent.className = 'text-content';
  textContent.style.direction = direction; // Set direction for RTL support
  textContent.style.textAlign = 'center'; // Center alignment for both directions
  
  // If we have a cached font size, apply it immediately to avoid jitter
  if (cachedFontSize !== undefined) {
    textContent.style.fontSize = `${cachedFontSize}px`;
  }
  
  // Create divs for each line
  lines.forEach((line) => {
    const lineDiv = document.createElement('div');
    lineDiv.textContent = line;
    lineDiv.style.direction = direction; // Set direction for each line
    textContent.appendChild(lineDiv);
  });
  
  // Add to element
  element.appendChild(textContent);
  
  // Only calculate if not cached (first time only)
  if (cachedFontSize === undefined) {
    // Use double requestAnimationFrame to ensure layout is complete for first calculation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const fontSize = calculateOptimalFontSize(element, lines, text, currentLanguage);
        textContent.style.fontSize = `${fontSize}px`;
      });
    });
  }
}

function applyTranslations(translations) {
  currentTranslations = translations;
  
  // Apply translations to all elements with data-key (excluding rocket blocks and description elements)
  document.querySelectorAll("[data-key]").forEach((el) => {
    // Skip rocket blocks - they're handled separately
    if (el.classList.contains("white-block")) {
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
  const rocketBlocks = document.querySelectorAll(".white-block");
  
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
  
  // If exactly 3 items are selected and we're on index page, precompute wordcloud
  if (selectedItems.length === 3 && !isWordcloudPage()) {
    const selectedKeys = selectedItems.map(item => item.key);
    precomputeWordcloud(selectedKeys);
  }
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
  // Returns the path to the wordcloud image for a given language
  // All languages use suffix including _en
  return `/static/wordcloud/wordcloud_${language}.png`;
}

function updateWordcloudImage(language) {
  // Update wordcloud image src to the correct language version
  const wordcloudImage = document.getElementById('wordcloud-image');
  if (wordcloudImage) {
    wordcloudImage.src = getWordcloudImagePath(language);
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
  
  // Collect selected item keys
  const selectedKeys = selectedItems.map(item => item.key);
  
  try {
    // Submit vote and redirect immediately (wordcloud already precomputed)
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
    
    // Redirect immediately - wordcloud is already generated
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
  const rocketBlocks = document.querySelectorAll(".white-block");
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

  // Load font sizes from server first
  await loadFontSizes();
  
  // Initialize language from localStorage (or default to "en") without regenerating wordcloud on page load
  setLanguage(currentLanguage, false);
  
  // If on wordcloud page, initialize the image with the current language
  if (isWordcloudPage()) {
    updateWordcloudImage(currentLanguage);
  }
  
  // Initialize launch button state (should be disabled initially, only on index page)
  if (!isWordcloudPage()) {
    updateLaunchButtonState();
  }
});