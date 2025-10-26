const Image = require("@11ty/eleventy-img");
const {DateTime} = require("luxon");
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");

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

module.exports = function (eleventyConfig) {
    // Plugins
    eleventyConfig.addPlugin(syntaxHighlight);

    // Copy assets
    eleventyConfig.addPassthroughCopy("src/css");
    eleventyConfig.addPassthroughCopy("src/photos");
    eleventyConfig.addPassthroughCopy({".nojekyll": ".nojekyll"});

    // Date filter
    eleventyConfig.addFilter("readableDate", dateObj => {
        return DateTime.fromJSDate(dateObj, {zone: 'utc'}).toFormat("yyyy-MM-dd");
    });

    // Random filter
    eleventyConfig.addFilter("random", array => {
        return array[Math.floor(Math.random() * array.length)];
    });

    // Aspect ratio filter
    eleventyConfig.addNunjucksAsyncFilter("getAspectClass", async function (imagePath, callback) {
        try {
            const metadata = await Image(imagePath, {
                widths: [1],
                formats: ["jpeg"],
                outputDir: "./_site/img/",
                dryRun: true
            });

            const img = metadata.jpeg[0];
            const ratio = img.width / img.height;

            let cssClass = "aspect-landscape";
            if (ratio < 0.7) {
                cssClass = "aspect-portrait";
            } else if (ratio >= 0.7 && ratio < 1.3) {
                cssClass = "aspect-square";
            } else if (ratio >= 1.3 && ratio < 1.8) {
                cssClass = "aspect-landscape";
            } else if (ratio >= 1.8) {
                cssClass = "aspect-panorama";
            }

            callback(null, cssClass);
        } catch (e) {
            callback(null, "aspect-landscape");
        }
    });
    // Image shortcode
    eleventyConfig.addNunjucksAsyncShortcode("image", imageShortcode);

    // Collections
    eleventyConfig.addCollection("posts", function (collectionApi) {
        return collectionApi.getFilteredByGlob("src/posts/*.md").reverse();
    });

    eleventyConfig.addCollection("photos", function (collectionApi) {
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
