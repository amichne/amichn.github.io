const Image = require("@11ty/eleventy-img");
const { DateTime } = require("luxon");

async function imageShortcode(src, alt, sizes = "100vw") {
  const metadata = await Image(src, {
    widths: [600, 1200, 1800],
    formats: ["webp", "jpeg"],
    outputDir: "./_site/img/",
    urlPath: "/img/"
  });

  const imageAttributes = {
    alt,
    sizes,
    loading: "lazy",
    decoding: "async",
  };

  return Image.generateHTML(metadata, imageAttributes);
}

module.exports = function(eleventyConfig) {
  // Copy assets
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/photos");

  // Date filter
  eleventyConfig.addFilter("readableDate", dateObj => {
    return DateTime.fromJSDate(dateObj, {zone: 'utc'}).toFormat("yyyy-MM-dd");
  });

  // Image shortcode
  eleventyConfig.addNunjucksAsyncShortcode("image", imageShortcode);

  // Collections
  eleventyConfig.addCollection("posts", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/posts/*.md").reverse();
  });

  eleventyConfig.addCollection("photos", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/photos/*.md").reverse();
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};