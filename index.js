var jsonld = require("jsonld");
var RdfXmlParser = require("rdf-parser-rdfxml");

function toJSONLD(input, rdfparserOptions, jsonldOptions, jsonldContext, callback) { 
  // https://github.com/linkeddata/rdflib.js/issues/78
  // https://github.com/digitalbazaar/jsonld.js/issues/108
  var rdfXmlParser = function(input, callback) {
    var parser = new RdfXmlParser();
    // Namespace xmlns:mwapi="http://wikiba.se/ontology#api#" URI is invalid
    // and makes at least Chrome disqualify the XML.
    // Work around that, since wikidata sends that namespace by default in
    // a lot of responses.
    input = input.replace(/http:\/\/wikiba.se\/ontology#api#/,
                          "http://wikiba.se/ontology#api%23");
    parser.parse(input, function(err, dataset) {
      if (err) {
        callback(err);
        return;
      }

      var data = dataset._graph.map(function(triple) {
        var rdfNodeToJsonldNode = function(node) {
          var mapped = {};
          switch (node.interfaceName) {
            case "BlankNode":
            case "NamedNode": {
              mapped.type = "IRI";
              mapped.value = node.nominalValue;
              break;
            }
            case "Literal": {
              mapped.type = "literal";
              mapped.datatype = rdfNodeToJsonldNode(node.datatype);
              if ("type" in mapped.datatype && mapped.datatype.type == "IRI") {
                mapped.datatype = mapped.datatype.value;
              }
              if ("language" in node && node.language) {
                mapped.language = node.language;
              }
              mapped.value = node.nominalValue;
              break;
            }
            default: {
               throw new Error("Unsupported interfaceName: " + node.interfaceName);
            }
          }
          return mapped;
        }

        return {
          subject: rdfNodeToJsonldNode(triple.subject),
          predicate: rdfNodeToJsonldNode(triple.predicate),
          object: rdfNodeToJsonldNode(triple.object),
        };
      });
      if (process.env.DEBUG_RDF2JSONLD) console.log("Mapped: " + JSON.stringify(data, null, 2));
      return callback(null, {"@default": data });
    });
  }
  jsonld.registerRDFParser("application/rdf+xml", rdfXmlParser);

  jsonld.fromRDF(input, rdfparserOptions, function(err, obj) {
    if (err) {
      throw new Error(err);
    }

    // Find sub properties @id one level down. Luckily, they are layed out that
    // way, so we do not need to go deeper.
    var findSubProps = function(x) {
      var subprops = x.map(function(o) {
        var sprops = [];
        for (var p in o) {
          if (Array.isArray(o[p])) {
            o[p].forEach(function(oi) {
              if (typeof oi == "object" && "@id" in oi) {
                sprops.push(oi["@id"]);
              }
            });
          }
        }
        return sprops;
      }).filter(function(o) {
        return o.length > 0;
      });
      subprops = [].concat.apply([], subprops);
      return subprops;
    }

    var subprops = findSubProps(obj);
    // XXX: compare to jsonld.objectify

    var frame =  {
      // XXX: workaround bug. After embedding, we don't want the lonely
      // stray nodes in the graph talking about sub properties.

      "@embed": "@always"
    };


    jsonld.frame(obj, frame, {}, function(err, obj) {
      if (err) {
        callback(err);
        return;
      }
      if (process.env.DEBUG_RDF2JSONLD) console.log("JSON-LD Framed: " + JSON.stringify(obj, null, 2));

      // Remove topics that are subproperties from the graph.
      obj["@graph"] = obj["@graph"].filter(function(o) {
        return !subprops.includes(o["@id"]);
      });

      if (process.env.DEBUG_RDF2JSONLD) console.log("Removed embedded:" + JSON.stringify(obj, null, 2));

      jsonld.compact(obj, jsonldContext, jsonldOptions, function(err, obj) {
        if (err) {
          callback(err);
          return;
        }
        if (Object.keys(obj).length == 1 && !("@graph" in obj)) {
           // Only @context - no real data. Add @graph for object compatibility,
           // so that collections can be detected easily from plain objects.
          obj["@graph"] = [];
        }
        callback(null, obj);
      });
    });
  });
}

if (require.main === module) { // Run from command line.
  var fs = require("fs");
  function convertFile(filename) {
    //console.log("Reading filename=" + filename);
    fs.readFile(filename, "utf8", function(err, data) {
      if (err) {
        throw new Error(err);
      }

      var ext = filename.substr(filename.lastIndexOf(".") + 1);
      var ext2Mime = {
        "rdf" : "application/rdf+xml",
        "nt" : "application/nquads",
        "nq" : "application/nquads"
      };

      var mime = ext2Mime[ext];
      var rdfparserOptions = { format: mime, useNativeTypes: true };
      var jsonldContext = {
        "@context": {
          "label" : "http://www.w3.org/2000/01/rdf-schema#label",
          "description" : "http://www.w3.org/2000/01/rdf-schema#description",
          "@language": "fi"
        }
      };
      // http://www.w3.org/TR/json-ld-api/#widl-JsonLdOptions-base
      var jsonldOptions = { compactArrays: true };
      //console.log("Will convert to JSON-LD: filename=" + filename + ", mime=" + mime);
      toJSONLD(data, rdfparserOptions, null, jsonldContext, function(err, obj) {
        console.log(JSON.stringify(obj, null, 2));
      });
    });
  }
  convertFile(process.argv[2]);
}

exports.toJSONLD = toJSONLD;



