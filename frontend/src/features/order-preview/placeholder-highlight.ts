import Highlight from "@tiptap/extension-highlight"

export const PlaceholderHighlight = Highlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      placeholderKey: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-placeholder-key"),
        renderHTML: (attributes) => {
          if (!attributes.placeholderKey) {
            return {}
          }
          return {
            "data-placeholder-key": attributes.placeholderKey,
          }
        },
      },
    }
  },
})
