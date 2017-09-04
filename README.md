rdfxml2jsonld
=============

## Introduction

Converts RDF (application/rdf+xml) into JSON-LD.

## Example usage

    node . examples/sample2.rdf

This will output

    {
      "@context": {
        "label": "http://www.w3.org/2000/01/rdf-schema#label",
        "description": "http://www.w3.org/2000/01/rdf-schema#description",
        "@language": "fi"
      },
      "@id": "http://www.wikidata.org/entity/Q47034",
      "description": "kaupunki Uudenmaan maakunnassa",
      "label": "Espoo"
    }