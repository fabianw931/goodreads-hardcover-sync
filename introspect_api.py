import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

HC_TOKEN = os.environ.get('HARDCOVER_API_TOKEN')
# Smart Bearer handling
if HC_TOKEN and not HC_TOKEN.startswith("Bearer "):
    HC_TOKEN = f"Bearer {HC_TOKEN}"

HC_ENDPOINT = "https://api.hardcover.app/v1/graphql"

def run_query(query):
    headers = {
        "Authorization": HC_TOKEN,
        "Content-Type": "application/json"
    }
    response = requests.post(HC_ENDPOINT, json={'query': query}, headers=headers)
    return response.json()

# Introspect mutation_root to find 'insert_user_book' or similar
query = """
query IntrospectAuthors {
  __type(name: "authors") {
    fields {
      name
      type {
        name
        kind
        ofType {
          name
          kind
        }
      }
    }
  }
}
"""

print("Fetching Schema...")
res = run_query(query)

if 'errors' in res:
    print("Errors:", res['errors'])
else:
    fields = res['data']['__type']['fields']
    print(f"Fields on authors:")
    for field in fields:
        type_name = field['type']['name'] or (field['type']['ofType']['name'] if field['type']['ofType'] else "Unknown")
        print(f"- {field['name']} ({type_name})")
