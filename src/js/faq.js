/*
 * Holy Private Bookmarks — Encrypted Local Bookmark Manager
 * Copyright (C) 2026 OSV-IT-Studio
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Source code: https://github.com/OSV-IT-Studio/holy-private-bookmarks
 */
function getMessage(key, substitutions = []) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

function localizeFaqPage() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const text = getMessage(key);
    if (text) {
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.placeholder = text;
      } else if (element.tagName === 'TITLE') {
        document.title = text;
      } else {

        if (text.includes('\n')) {
          element.innerHTML = text.replace(/\n/g, '<br>');
        } else {
          element.textContent = text;
        }
      }
    }
  });
  

  setTimeout(() => {

    document.querySelectorAll('.faq-answer-content li[data-i18n]').forEach(li => {
      const key = li.getAttribute('data-i18n');
      const text = getMessage(key);
      if (text) {
        li.innerHTML = text;
      }
    });
    

    document.querySelectorAll('.security-tip span[data-i18n]').forEach(span => {
      const key = span.getAttribute('data-i18n');
      const text = getMessage(key);
      if (text) {
        span.textContent = text;
      }
    });
  }, 100);
}

function initializeFAQ() {

  localizeFaqPage();
  

  const backBtn = document.getElementById('back-to-main');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {

        window.close();
      }
    });
  }
  

  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    const expandIcon = question.querySelector('.expand-icon');
    
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      

      faqItems.forEach(otherItem => {
        if (otherItem !== item && otherItem.classList.contains('active')) {
          otherItem.classList.remove('active');
          const otherIcon = otherItem.querySelector('.expand-icon');
          if (otherIcon) {
            otherIcon.textContent = '➕';
          }
        }
      });
      

      item.classList.toggle('active');
      

      if (expandIcon) {
        if (item.classList.contains('active')) {
          expandIcon.textContent = '−';
        } else {
          expandIcon.textContent = '➕';
        }
      }
    });
  });
  

  const searchInput = document.getElementById('faq-search');
  if (searchInput) {
    searchInput.addEventListener('input', filterFAQs);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        filterFAQs();
      }
    });
  }
  

  const categoryBtns = document.querySelectorAll('.category-btn');
  categoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {

      categoryBtns.forEach(b => b.classList.remove('active'));

      btn.classList.add('active');
      

      filterFAQs();
    });
  });
  

  const githubBtn = document.getElementById('open-github-faq');
  if (githubBtn) {
    githubBtn.addEventListener('click', () => {
      chrome.tabs.create({
        url: 'https://github.com/OSV-IT-Studio/holy-private-bookmarks'
      });
    });
  }
  
  const supportBtn = document.getElementById('support-faq');
  if (supportBtn) {
    supportBtn.addEventListener('click', () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('donate.html')
      });
    });
  }
  

  if (faqItems.length > 0) {
    faqItems[0].classList.add('active');
    const firstExpandIcon = faqItems[0].querySelector('.expand-icon');
    if (firstExpandIcon) {
      firstExpandIcon.textContent = '−';
    }
  }
  

  setTimeout(() => {
    if (searchInput) {
      searchInput.focus();
    }
  }, 300);
}

function filterFAQs() {
  const searchInput = document.getElementById('faq-search');
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  const activeCategoryBtn = document.querySelector('.category-btn.active');
  const activeCategory = activeCategoryBtn ? activeCategoryBtn.dataset.category : 'all';
  
  const faqItems = document.querySelectorAll('.faq-item');
  let visibleCount = 0;
  
  faqItems.forEach(item => {
    const category = item.dataset.category;
    const question = item.querySelector('h3').textContent.toLowerCase();
    const answer = item.querySelector('.faq-answer-content').textContent.toLowerCase();
    

    const categoryMatch = activeCategory === 'all' || category === activeCategory;
    

    const searchMatch = !searchTerm || 
                       question.includes(searchTerm) || 
                       answer.includes(searchTerm);
    

    if (categoryMatch && searchMatch) {
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      visibleCount++;
      

      if (searchTerm) {
        highlightText(item, searchTerm);
      } else {
        removeHighlights(item);
      }
    } else {
      item.style.display = 'none';
      removeHighlights(item);
    }
  });
  

  showNoResultsMessage(visibleCount === 0);
}

function highlightText(element, searchTerm) {

  removeHighlights(element);
  

  function highlightNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      const lowerText = text.toLowerCase();
      const index = lowerText.indexOf(searchTerm);
      
      if (index >= 0) {
        const before = text.substring(0, index);
        const match = text.substring(index, index + searchTerm.length);
        const after = text.substring(index + searchTerm.length);
        
        const beforeNode = document.createTextNode(before);
        const matchNode = document.createElement('mark');
        matchNode.textContent = match;
        const afterNode = document.createTextNode(after);
        
        const parent = node.parentNode;
        parent.replaceChild(beforeNode, node);
        parent.insertBefore(matchNode, beforeNode.nextSibling);
        parent.insertBefore(afterNode, matchNode.nextSibling);
        

        highlightNode(afterNode);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE && 
               !['SCRIPT', 'STYLE', 'MARK'].includes(node.tagName)) {
      Array.from(node.childNodes).forEach(child => highlightNode(child));
    }
  }
  

  const answerContent = element.querySelector('.faq-answer-content');
  if (answerContent) {
    highlightNode(answerContent);
  }
}

function removeHighlights(element) {
  const marks = element.querySelectorAll('mark');
  marks.forEach(mark => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
  });
}

function showNoResultsMessage(show) {

  let noResults = document.getElementById('no-results-message');
  
  if (show && !noResults) {

    noResults = document.createElement('div');
    noResults.id = 'no-results-message';
    noResults.className = 'no-results';
    
    noResults.innerHTML = `
      <div class="no-results-icon">🔍</div>
      <h3 data-i18n="noResultsTitle">No questions found</h3>
      <p data-i18n="noResultsText">Try a different search term or category</p>
    `;
    

    setTimeout(() => {
      const title = noResults.querySelector('[data-i18n="noResultsTitle"]');
      const text = noResults.querySelector('[data-i18n="noResultsText"]');
      
      if (title) title.textContent = getMessage('noResultsTitle');
      if (text) text.textContent = getMessage('noResultsText');
    }, 100);
    

    const faqList = document.getElementById('faq-list');
    if (faqList && faqList.parentNode) {
      faqList.parentNode.insertBefore(noResults, faqList);
    }
    
    noResults.style.display = 'block';
  } else if (!show && noResults) {

    noResults.remove();
  }
}


document.addEventListener('DOMContentLoaded', initializeFAQ);


document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const searchInput = document.getElementById('faq-search');
    if (searchInput && searchInput.value) {
      searchInput.value = '';
      filterFAQs();
      searchInput.focus();
    }
  }
});