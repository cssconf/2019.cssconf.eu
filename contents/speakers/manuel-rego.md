----

# THIS FILE WAS GENERATED AUTOMATICALLY.
# CHANGES MADE HERE WILL BE OVERWRITTEN.

template: pages/speaker.html.njk
title: 'Manuel Rego: Improving Website Performance with CSS Containment'
speaker:
  published: true
  reviewed: true
  type: speaker
  talkTitle: Improving Website Performance with CSS Containment
  name: Manuel Rego
  twitterHandle: regocas
  githubHandle: mrego
  homepage: 'https://blogs.igalia.com/mrego/'
  potraitImageUrl: >-
    https://storage.googleapis.com/wwwtf18-data/cssconf19-speaker-images/manuel-rego.jpg
  image:
    filename: >-
      manuel-rego-improving-website-performance-with-css-containment-fc5a2336.jpg
    filename_500: >-
      manuel-rego-improving-website-performance-with-css-containment-fc5a2336-500.jpg
    filename_1000: >-
      manuel-rego-improving-website-performance-with-css-containment-fc5a2336-1000.jpg
    width: 500
    height: 500

----

CSS Containment (https://drafts.csswg.org/css-contain) is a new standard
focused on improving the rendering performance of web pages by allowing the
isolation of a subtree from the rest of the page. User agents that implement
the "contain" property take advantage of this feature to apply strong
optimizations therefore significantly boosting the performance of the web page.
In this talk we will provide an introduction to this specification, explaining
the types of containment available and the different use cases for each of
them.

We will also take a look at some examples of optimizations implemented in the
rendering engine based on css-contain. Finally, we will review the status of
CSS containment on the different browsers and future plans regarding this new
feature.