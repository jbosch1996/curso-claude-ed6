
# SHOULD use pagination response page object [248]

For iterating over collections (result sets) we propose to either use cursors  or simple hypertext control links. To implement these in a consistent way, we have defined a response page object pattern with the following field semantics:

- self: the link or cursor pointing to the same page.
- first: the link or cursor pointing to the first page.
- prev: the link or cursor pointing to the previous page. It is not provided, if it is the first page.
- next: the link or cursor pointing to the next page. It is not provided, if it is the last page.
- last: the link or cursor pointing to the last page.

Pagination responses should contain the following additional array field to transport the page content:

- items: array of resources, holding all the items of the current page (items may be replaced by a resource name).

For responses to GET with body operations, the applied query filters should be (and for normal GET may be) returned using the following field:

- query: object containing the query filters applied in the search request to filter the collection resource. This can be directly used as the request body when following the pagination links.

In conclusion, the standard response page using plain cursors or pagination links may be defined as follows:

```
ResponsePage:
  type: object
  required:
    - items
  properties:
    self:
      description: Pagination link|cursor pointing to the current page.
      type: string
      format: uri|cursor
    first:
      description: Pagination link|cursor pointing to the first page.
      type: string
      format: uri|cursor
    prev:
      description: Pagination link|cursor pointing to the previous page.
      type: string
      format: uri|cursor
    next:
      description: Pagination link|cursor pointing to the next page.
      type: string
      format: uri|cursor
    last:
      description: Pagination link|cursor pointing to the last page.
      type: string
      format: uri|cursor

    query:
      description: >
        Object containing the query filters applied to the collection resource.
        This can be directly used as a request body (together with the cursors/links)
        when requesting other pages.
      type: object
      properties: ...

    items:
      description: Array of collection items.
      type: array
      required: false
      items:
        type: ...
```