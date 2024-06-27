const { chromium } = require('playwright');
const fs = require('fs');
const cheerio = require('cheerio');

const endpoint = 'https://tveyenyc.com/calendar/';
let gigzArr = [];

(async () => {
  // Launch a browser
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Navigate to the website
  await page.goto(endpoint, { waitUntil: 'domcontentloaded' });

  // Wait for the event list to load
  await page.waitForSelector('.event-info-block');

  let loadMoreVisible = await isElementVisible(page, '.seetickets-list-view-load-more-button');
  while (loadMoreVisible) {
    await page.click('.seetickets-list-view-load-more-button');
    await page.waitForTimeout(3000); // Adjust timeout as needed
    loadMoreVisible = await isElementVisible(page, '.seetickets-list-view-load-more-button');
  }

  // Capture the event nodes and links
  const eventsData = await page.$$eval('.event-info-block', eventNodes => {
    return eventNodes.map(eventNode => {
      const title = eventNode.querySelector('p.title a')?.innerText.trim() || 'No Title';
      const dateElement = eventNode.querySelector('p.date')?.innerText.trim() || '';
      const photoUrl = eventNode.querySelector('img')?.getAttribute('src') || "https://tveyenyc.com/wp-content/uploads/2023/01/tv-eye-e1673392710636.jpeg";
      const link = eventNode.querySelector('p.title a')?.getAttribute('href') || '';
      const headliners = eventNode.querySelector('p.headliners')?.innerText.trim() || '';
      const doortime = eventNode.querySelector('span.see-doortime')?.innerText.trim() || '';
      const showtime = eventNode.querySelector('span.see-showtime')?.innerText.trim() || '';
      const venue = eventNode.querySelector('p.venue')?.innerText.trim() || '';
      const price = eventNode.querySelector('span.price')?.innerText.trim() || '';
      const genre = eventNode.querySelector('p.genre')?.innerText.trim() || '';

      return { title, dateElement, photoUrl, link, headliners, doortime, showtime, venue, price, genre };
    });
  });

  // Process each event
  for (const event of eventsData) {
    const eventPage = await browser.newPage();
    await eventPage.goto(event.link, { waitUntil: 'domcontentloaded' });
    const eventContent = await eventPage.content();
    const $ = cheerio.load(eventContent);

    const descriptionHtml = $('.event-details').html() || '';
    const image = $('#extra-data-container > div.event-images-box > div.main-image.m-b-5 > a > img').attr('src') || "https://tveyenyc.com/wp-content/uploads/2023/01/tv-eye-e1673392710636.jpeg";
    const excerpt = processExcerpt(descriptionHtml, event.link);

    gigzArr.push({
      title: event.title,
      date: formatDateStringForMongoDB(event.dateElement),
      genre: event.genre,
      location: event.venue,
      time: event.showtime || "¯\\_(ツ)_/¯",
      price: event.price,
      isFeatured: false,
      image,
      excerpt: excerpt,
      link: event.link
    });

    await eventPage.close();
  }

  // Print and save the extracted events
  console.log(gigzArr);
  fs.writeFileSync('data.json', JSON.stringify(gigzArr, null, 2), 'utf-8');
  console.log('Data written to data.json');

  // Close the browser
  await browser.close();
})();

const processExcerpt = (html, link) => {
  const $ = cheerio.load(html);
  let formattedExcerpt = "";

  // Extract only the relevant paragraphs and specific elements
  $('p').each((i, el) => {
    formattedExcerpt += $.html(el);
  });

  // Add BUY TICKETS link as a list item if it exists
  if (link) {
    formattedExcerpt += `<br><br><ul><li><a href='${link}'>BUY TICKETS</a></li></ul>`;
  }

  return formattedExcerpt;
};

const formatDateStringForMongoDB = (dateString) => {
  const currentYear = new Date().getFullYear();
  const date = new Date(`${dateString} ${currentYear}`);

  // Convert date to ISO string
  let isoString = date.toISOString();

  let datePart = isoString.split('T')[0]; // Separates date from time
  let timePart = '00:00:00.000';
  let timezoneOffset = '+00:00'; // Adjust if you need a different timezone

  return `${datePart}T${timePart}${timezoneOffset}`;
};

const isElementVisible = async (page, selector) => {
  return await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    return el ? true : false;
  }, selector);
};
